import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { findUserById } from '../models/User.js';
import { createMessage, updateMessageStatus, updateMessageContent, softDeleteMessage, togglePinMessage, addReaction, removeReaction } from '../models/Message.js';
import { findFriendship } from '../models/Friendship.js';
import { setOnlineStatus, removeOnlineStatus, isUserOnline } from '../db/redis.js';

let io;
const userSockets = new Map();

const checkFriendship = async (userId, targetId) => {
  const result = await findFriendship(userId, targetId);
  return result && result.status === 'accepted';
};

export const initWebSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: config.cors.origin,
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await findUserById(decoded.userId);
      
      if (!user || user.is_blocked) {
        return next(new Error('Invalid user'));
      }

      socket.userId = user.id;
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.userId}`);
    
    userSockets.set(socket.userId, socket.id);
    await setOnlineStatus(socket.userId, socket.id);

    socket.join(`user:${socket.userId}`);

    socket.emit('connected', { userId: socket.userId });

    socket.on('message', async (data) => {
      try {
        const { recipientId, encryptedContent, contentType, tempId, fileUrl, fileName, fileSize, replyToId } = data;

        const friendship = await findFriendship(socket.userId, recipientId);
        if (!friendship || friendship.status !== 'accepted') {
          socket.emit('error', { message: 'Not friends with this user', tempId });
          return;
        }

        const message = await createMessage({
          senderId: socket.userId,
          recipientId,
          encryptedContent,
          contentType: contentType || 'text',
          fileUrl,
          fileName,
          fileSize,
          replyToId
        });

        const recipientOnline = await isUserOnline(recipientId);
        const status = recipientOnline ? 'delivered' : 'sent';

        if (recipientOnline) {
          io.to(`user:${recipientId}`).emit('message', {
            id: message.id,
            senderId: socket.userId,
            encryptedContent,
            contentType: contentType || 'text',
            fileUrl,
            fileName,
            fileSize,
            replyToId,
            status: 'delivered',
            tempId
          });
        }

        socket.emit('message_sent', {
          id: message.id,
          recipientId,
          status,
          tempId
        });

      } catch (error) {
        console.error('Message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('edit_message', async (data) => {
      try {
        const { messageId, encryptedContent, recipientId } = data;
        const message = await updateMessageContent(messageId, socket.userId, encryptedContent);
        if (message) {
          io.to(`user:${recipientId}`).emit('message_edited', {
            id: message.id,
            encryptedContent: message.encrypted_content,
            editedAt: message.edited_at
          });
        }
      } catch (error) {
        console.error('Edit message error:', error);
      }
    });

    socket.on('delete_message', async (data) => {
      try {
        const { messageId, recipientId } = data;
        const deleted = await softDeleteMessage(messageId, socket.userId);
        if (deleted) {
          io.to(`user:${recipientId}`).emit('message_deleted', { id: messageId });
        }
      } catch (error) {
        console.error('Delete message error:', error);
      }
    });

    socket.on('pin_message', async (data) => {
      try {
        const { messageId, recipientId } = data;
        const message = await togglePinMessage(messageId, socket.userId);
        if (message) {
          io.to(`user:${recipientId}`).emit('message_pinned', {
            id: message.id,
            isPinned: message.is_pinned,
            pinnedAt: message.pinned_at
          });
        }
      } catch (error) {
        console.error('Pin message error:', error);
      }
    });

    socket.on('add_reaction', async (data) => {
      try {
        const { messageId, emoji, recipientId } = data;
        const reaction = await addReaction(messageId, socket.userId, emoji);
        io.to(`user:${recipientId}`).emit('reaction_added', {
          messageId,
          emoji,
          userId: socket.userId,
          userName: socket.user.display_name
        });
      } catch (error) {
        console.error('Add reaction error:', error);
      }
    });

    socket.on('remove_reaction', async (data) => {
      try {
        const { messageId, emoji, recipientId } = data;
        await removeReaction(messageId, socket.userId, emoji);
        io.to(`user:${recipientId}`).emit('reaction_removed', {
          messageId,
          emoji,
          userId: socket.userId
        });
      } catch (error) {
        console.error('Remove reaction error:', error);
      }
    });

    socket.on('typing', async (data) => {
      try {
        const { recipientId } = data;
        const friendship = await findFriendship(socket.userId, recipientId);
        if (friendship && friendship.status === 'accepted') {
          io.to(`user:${recipientId}`).emit('typing', {
            userId: socket.userId,
            userName: socket.user.display_name
          });
        }
      } catch (error) {
        console.error('Typing error:', error);
      }
    });

    socket.on('call', async (data) => {
      console.log('Call received:', data);
      const { targetId, roomId, callType } = data;
      
      const isFriend = await checkFriendship(socket.userId, targetId);
      if (!isFriend) {
        console.log('Call blocked: users are not friends');
        socket.emit('call-error', { message: 'Можно звонить только друзьям' });
        return;
      }
      
      io.to(`user:${targetId}`).emit('incoming-call', {
        SenderID: socket.userId,
        RoomID: roomId,
        CallType: callType
      });
    });

    socket.on('accept', async (data) => {
      console.log('Accept received:', data);
      const { targetId, roomId, callType } = data;
      
      const isFriend = await checkFriendship(socket.userId, targetId);
      if (!isFriend) {
        console.log('Accept blocked: users are not friends');
        return;
      }
      
      console.log('Forwarding call-accepted to user:', targetId);
      io.to(`user:${targetId}`).emit('call-accepted', {
        SenderID: socket.userId,
        RoomID: roomId,
        CallType: callType
      });
    });

    socket.on('join', async (data) => {
      console.log('Join received:', data);
      const { targetId, roomId } = data;
      
      if (targetId) {
        const isFriend = await checkFriendship(socket.userId, targetId);
        if (!isFriend) {
          console.log('Join blocked: users are not friends');
          return;
        }
      }
      
      io.to(`user:${targetId || socket.userId}`).emit('user-joined', {
        SenderID: socket.userId,
        RoomID: roomId
      });
    });

    socket.on('offer', async (data) => {
      console.log('Offer received:', data);
      const { targetId, roomId, sdp } = data;
      
      const isFriend = await checkFriendship(socket.userId, targetId);
      if (!isFriend) {
        console.log('Offer blocked: users are not friends');
        return;
      }
      
      console.log('Forwarding offer to user:', targetId);
      io.to(`user:${targetId}`).emit('offer', {
        SenderID: socket.userId,
        RoomID: roomId,
        sdp: sdp
    });

    socket.on('answer', async (data) => {
      console.log('Answer received:', data);
      const { targetId, roomId, sdp } = data;
      
      const isFriend = await checkFriendship(socket.userId, targetId);
      if (!isFriend) {
        console.log('Answer blocked: users are not friends');
        return;
      }
      
      console.log('Forwarding answer to user:', targetId);
      io.to(`user:${targetId}`).emit('answer', {
        SenderID: socket.userId,
        RoomID: roomId,
        sdp: sdp
      });
    });
    });

    socket.on('answer', async (data) => {
      console.log('Answer received:', data);
      const { targetId, roomId, sdp } = data;
      
      const isFriend = await checkFriendship(socket.userId, targetId);
      if (!isFriend) {
        console.log('Answer blocked: users are not friends');
        return;
      }
      
      console.log('Forwarding answer to user:', targetId);
      io.to(`user:${targetId}`).emit('answer', {
        SenderID: socket.userId,
        RoomID: roomId,
        sdp: sdp
      });
    });

    socket.on('ice-candidate', async (data) => {
      console.log('ICE candidate received:', data);
      const { targetId, candidate, sdpMid, sdpMLineIndex } = data;
      
      const isFriend = await checkFriendship(socket.userId, targetId);
      if (!isFriend) {
        console.log('ICE candidate blocked: users are not friends');
        return;
      }
      
      console.log('Forwarding ICE candidate to user:', targetId);
      io.to(`user:${targetId}`).emit('ice-candidate', {
        SenderID: socket.userId,
        candidate: candidate,
        sdpMid: sdpMid,
        sdpMLineIndex: sdpMLineIndex
      });
    });

    socket.on('end-call', async (data) => {
      console.log('End call received:', data);
      const { targetId } = data;
      
      const isFriend = await checkFriendship(socket.userId, targetId);
      if (!isFriend) {
        console.log('End call blocked: users are not friends');
        return;
      }
      
      if (targetId) {
        io.to(`user:${targetId}`).emit('call-ended', {
          SenderID: socket.userId
        });
      }
    });

    socket.on('read', async (data) => {
      try {
        const { messageId, senderId } = data;
        
        await updateMessageStatus(messageId, 'read');

        io.to(`user:${senderId}`).emit('message_status', {
          messageId,
          status: 'read'
        });
      } catch (error) {
        console.error('Read error:', error);
      }
    });

    socket.on('mark_delivered', async (data) => {
      try {
        const { messageId, senderId } = data;
        
        await updateMessageStatus(messageId, 'delivered');

        if (senderId) {
          io.to(`user:${senderId}`).emit('message_status', {
            messageId,
            status: 'delivered'
          });
        }
      } catch (error) {
        console.error('Mark delivered error:', error);
      }
    });

    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.userId}`);
      
      userSockets.delete(socket.userId);
      await removeOnlineStatus(socket.userId);

      socket.broadcast.emit('user_offline', { userId: socket.userId });
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  return io;
};

export const markAsDelivered = async (message) => {
  if (io && message.recipient_id) {
    const recipientSocket = userSockets.get(message.recipient_id);
    if (recipientSocket) {
      io.to(`user:${message.recipient_id}`).emit('message', {
        id: message.id,
        senderId: message.sender_id,
        encryptedContent: message.encrypted_content,
        contentType: message.content_type,
        fileUrl: message.file_url,
        fileName: message.file_name,
        fileSize: message.file_size,
        status: 'delivered'
      });
    }
  }
};

export const getIO = () => io;
