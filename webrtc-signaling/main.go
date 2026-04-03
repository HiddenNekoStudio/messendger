package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Message struct {
	Type      string          `json:"type"`
	RoomID    string          `json:"roomId"`
	SenderID  string          `json:"senderId"`
	TargetID  string          `json:"targetId,omitempty"`
	SDP       string          `json:"sdp,omitempty"`
	Candidate string          `json:"candidate,omitempty"`
	CallType  string          `json:"callType,omitempty"`
}

type Client struct {
	conn     *websocket.Conn
	userID   string
	roomID   string
	callType string
}

type Room struct {
	clients map[string]*Client
}

var rooms = make(map[string]*Room)
var clients = make(map[string]*Client)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3004"
	}

	http.HandleFunc("/ws", handleWebSocket)
	http.HandleFunc("/health", handleHealth)

	log.Printf("WebRTC Signaling Server started on port %s", port)

	go func() {
		if err := http.ListenAndServe(":"+port, nil); err != nil {
			log.Fatal("ListenAndServe: ", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Server shutting down...")
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	userID := r.URL.Query().Get("userId")
	if userID == "" {
		log.Println("No userId provided")
		conn.Close()
		return
	}

	log.Printf("User %s connected", userID)

	client := &Client{
		conn:   conn,
		userID: userID,
	}
	clients[userID] = client

	defer func() {
		cleanupClient(client)
		conn.Close()
	}()

	for {
		var msg Message
		err := conn.ReadJSON(&msg)
		if err != nil {
			log.Printf("Error reading JSON: %v", err)
			break
		}

		handleMessage(client, msg)
	}
}

func handleMessage(client *Client, msg Message) {
	log.Printf("MESSAGE: type=%s from=%s target=%s room=%s", msg.Type, client.userID, msg.TargetID, msg.RoomID)

	switch msg.Type {
	case "join":
		joinRoom(client, msg.RoomID, msg.CallType)

	case "leave":
		leaveRoom(client)

	case "offer", "answer", "ice-candidate":
		sendToTarget(client, msg)

	case "call":
		handleCall(client, msg)

	case "accept":
		log.Printf("!!! ACCEPT MESSAGE !!! from=%s target=%s room=%s", client.userID, msg.TargetID, msg.RoomID)
		handleAccept(client, msg)

	case "reject":
		handleReject(client, msg)

	case "end-call":
		handleEndCall(client, msg)

	default:
		log.Printf("Unknown message type: %s", msg.Type)
	}
}

func joinRoom(client *Client, roomID string, callType string) {
	client.roomID = roomID
	client.callType = callType

	if _, ok := rooms[roomID]; !ok {
		rooms[roomID] = &Room{
			clients: make(map[string]*Client),
		}
	}

	room := rooms[roomID]
	room.clients[client.userID] = client

	log.Printf("User %s joined room %s", client.userID, roomID)

	for _, c := range room.clients {
		if c.userID != client.userID {
			c.conn.WriteJSON(Message{
				Type:     "user-joined",
				SenderID: client.userID,
				CallType: callType,
			})
		}
	}
}

func leaveRoom(client *Client) {
	if client.roomID == "" {
		return
	}

	room, ok := rooms[client.roomID]
	if !ok {
		return
	}

	delete(room.clients, client.userID)

	for _, c := range room.clients {
		c.conn.WriteJSON(Message{
			Type:     "user-left",
			SenderID: client.userID,
		})
	}

	if len(room.clients) == 0 {
		delete(rooms, client.roomID)
	}

	log.Printf("User %s left room %s", client.userID, client.roomID)
	client.roomID = ""
}

func sendToTarget(client *Client, msg Message) {
	if msg.TargetID == "" {
		log.Println("No target ID provided")
		return
	}

	target, ok := clients[msg.TargetID]
	if !ok {
		log.Printf("Target %s not found", msg.TargetID)
		return
	}

	target.conn.WriteJSON(msg)
}

func handleCall(client *Client, msg Message) {
	target, ok := clients[msg.TargetID]
	if !ok {
		log.Printf("Target %s not found for call", msg.TargetID)
		client.conn.WriteJSON(Message{
			Type:    "call-error",
			TargetID: msg.TargetID,
		})
		return
	}

	target.conn.WriteJSON(Message{
		Type:      "incoming-call",
		SenderID:  client.userID,
		RoomID:    msg.RoomID,
		CallType:  msg.CallType,
	})

	log.Printf("Call from %s to %s", client.userID, msg.TargetID)
}

func handleAccept(client *Client, msg Message) {
	log.Printf("handleAccept: user=%s, target=%s, room=%s", client.userID, msg.TargetID, msg.RoomID)
	
	target, ok := clients[msg.TargetID]
	if !ok {
		log.Printf("handleAccept: target %s not found in clients", msg.TargetID)
		return
	}
	
	log.Printf("handleAccept: sending call-accepted to target %s", msg.TargetID)
	
	target.conn.WriteJSON(Message{
		Type:     "call-accepted",
		SenderID: client.userID,
		RoomID:   msg.RoomID,
	})
	
	log.Printf("handleAccept: joining rooms for both users")
	joinRoom(client, msg.RoomID, msg.CallType)
	joinRoom(target, msg.RoomID, msg.CallType)
	
	log.Printf("Call accepted between %s and %s", client.userID, msg.TargetID)
}

func handleReject(client *Client, msg Message) {
	target, ok := clients[msg.TargetID]
	if !ok {
		return
	}

	target.conn.WriteJSON(Message{
		Type:     "call-rejected",
		SenderID: client.userID,
	})
}

func handleEndCall(client *Client, msg Message) {
	broadcastToRoom(client, Message{
		Type:     "call-ended",
		SenderID: client.userID,
	})

	if client.roomID != "" {
		room, ok := rooms[client.roomID]
		if ok {
			for _, c := range room.clients {
				if c.userID != client.userID {
					delete(room.clients, c.userID)
				}
			}
		}
		delete(rooms, client.roomID)
		client.roomID = ""
	}
}

func broadcastToRoom(client *Client, msg Message) {
	if client.roomID == "" {
		return
	}

	room, ok := rooms[client.roomID]
	if !ok {
		return
	}

	for _, c := range room.clients {
		if c.userID != client.userID {
			c.conn.WriteJSON(msg)
		}
	}
}

func cleanupClient(client *Client) {
	if client.roomID != "" {
		leaveRoom(client)
	}
	delete(clients, client.userID)
	log.Printf("User %s disconnected", client.userID)
}