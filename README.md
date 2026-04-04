# 🔒 SecureMessenger

Приватный мессенджер с end-to-end шифрованием сообщений. Регистрация только по инвайтам.

[![Docker](https://img.shields.io/badge/Docker-Ready-blue?style=flat-square)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=flat-square)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue?style=flat-square)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7+-red?style=flat-square)](https://redis.io/)

---

## ✨ Возможности

### 📱 Мессенджер
| Возможность | Описание |
|-------------|----------|
| 🔄 Real-time сообщения | Мгновенная доставка через WebSocket |
| 📎 Файлы и изображения | Загрузка до 100 МБ |
| 👤 Аватарки | Загрузка до 5 МБ |
| 👥 Система друзей | Запросы, принятие, отклонение |
| 🔍 Поиск пользователей | По нику (@username), email, имени |
| ⚡ Статусы онлайн/офлайн | Отображение в реальном времени |
| 🔄 Синхронизация | Автосинхронизация между устройствами (каждые 10 мин) |
| 🗑️ Удаление сообщений | Синхронизируемое удаление |
| ✍️ Индикатор набора текста | Оповещение о печати собеседника |
| 📱 Адаптивный дизайн | Работает на мобильных и десктопе |

### ⚙️ Админ-панель
| Функция | Описание |
|---------|----------|
| 📊 Dashboard | Статистика системы в реальном времени |
| 👥 Управление пользователями | Блокировка, удаление, назначение прав админа |
| 🎫 Инвайт-система | Создание и управление инвайт-кодами |
| ❤️ Health Check | Мониторинг всех сервисов |
| 📝 Логи действий | Просмотр истории действий пользователей |
| 💾 Управление хранилищем | Контроль использования диска |

### 🛡️ Безопасность
- **SSL/TLS** — шифрование всех соединений (HTTPS)
- **JWT** — безопасная аутентификация (15 мин access / 7 дней refresh)
- **httpOnly cookies** — защита refresh токенов от XSS
- **XSS защита** — экранирование HTML
- **Rate limiting** — ограничение частоты запросов
- **Валидация** — проверка всех входящих данных

---

## 🏗️ Архитектура

```
┌────────────────────────────────────────────────────────────────────┐
│                         Nginx (Port 443/80)                       │
│                    SSL Termination + Routing                      │
└──────────────┬──────────────┬──────────────┬────────────────────┘
               │              │              │
        ┌──────▼──────┐ ┌─────▼─────┐ ┌──────▼──────┐ ┌───────▼─────┐
        │  Messenger  │ │   Admin   │ │    Sync     │ │    Files    │
        │    :3000     │ │    :80    │ │    :3002    │ │    :3003    │
        └──────┬───────┘ └───────────┘ └──────┬───────┘ └─────────────┘
               │                               │
        ┌──────▼──────┐                  ┌─────▼─────┐
        │ PostgreSQL  │                  │   Redis   │
        │   :5432     │                  │   :6379   │
        └─────────────┘                  └───────────┘
```

---

## 🚀 Быстрый старт

### Требования
- Docker и Docker Compose
- Порты 80 и 443 свободны

### Установка

```bash
# Клонируйте репозиторий
git clone <repository-url>
cd messendger

# Настройте переменные окружения
cp .env.example .env
# Отредактируйте .env - ОБЯЗАТЕЛЬНО смените пароли и ключи!

# Запустите все сервисы
docker-compose up -d

# Проверьте статус
docker ps
```

### Доступ к сервисам

| Сервис | URL |
|--------|-----|
| 🌐 Мессенджер | https://localhost |
| ⚙️ Админ-панель | https://localhost/admin |

### Первый вход в админку

Учетные данные из `.env`:
```bash
ADMIN_NAME=admin
ADMIN_PASSWORD=<ваш_пароль>
```

---

## 📁 Структура проекта

```
messendger/
├── docker-compose.yml          # Оркестрация контейнеров
├── Dockerfile.messenger        # Backend + Frontend мессенджера
├── Dockerfile.admin            # Админ-панель
├── Dockerfile.sync             # Сервис синхронизации
├── Dockerfile.file             # Сервис файлов
├── Dockerfile.nginx            # Nginx балансировщик
│
├── nginx/
│   └── nginx.conf              # Конфигурация Nginx
│
├── backend/                    # Node.js бэкенд
│   └── src/
│       ├── index.js            # Точка входа
│       ├── config/             # Конфигурация
│       ├── db/                 # PostgreSQL, Redis
│       ├── models/             # Модели данных
│       ├── routes/             # API endpoints
│       ├── middleware/         # Auth, Admin, Validation
│       └── services/           # WebSocket, шифрование
│
├── messenger-frontend/         # Фронтенд мессенджера
│   ├── index.html
│   ├── main.js
│   └── styles/main.css
│
├── admin-frontend/             # Админ-панель
│
├── sync-service/              # Сервис синхронизации
├── file-service/               # Сервис файлов
│
├── ssl/                        # SSL сертификаты
├── uploads/                    # Загруженные файлы
└── .env                        # Переменные окружения
```

---

## 📡 API Endpoints

### 🔐 Аутентификация
| Method | Endpoint | Описание |
|--------|----------|----------|
| POST | `/api/auth/register` | Регистрация (нужен invite) |
| POST | `/api/auth/login` | Вход |
| POST | `/api/auth/logout` | Выход |
| POST | `/api/auth/refresh` | Обновление токена |
| GET | `/api/auth/me` | Текущий пользователь |

### 👤 Пользователи
| Method | Endpoint | Описание |
|--------|----------|----------|
| GET | `/api/users/search?q=` | Поиск по имени/email/нику |
| GET | `/api/users/:id` | Профиль пользователя |
| PUT | `/api/users/profile` | Обновление профиля |
| POST | `/api/users/avatar` | Загрузка аватарки |

### 👥 Друзья
| Method | Endpoint | Описание |
|--------|----------|----------|
| GET | `/api/friends` | Список друзей |
| POST | `/api/friends/request` | Отправить запрос |
| PUT | `/api/friends/request/:id` | Принять/отклонить |
| DELETE | `/api/friends/:id` | Удалить друга |
| GET | `/api/friends/requests` | Входящие запросы |

### 💬 Сообщения
| Method | Endpoint | Описание |
|--------|----------|----------|
| GET | `/api/messages/:friendId` | История сообщений |
| POST | `/api/messages/:friendId` | Отправить сообщение |
| DELETE | `/api/messages/:id` | Удалить сообщение |
| POST | `/api/messages/bulk-delete` | Массовое удаление |

### 🔄 Синхронизация
| Method | Endpoint | Описание |
|--------|----------|----------|
| POST | `/sync-api/api/sync/register` | Регистрация синхронизации |
| POST | `/sync-api/api/sync/sync` | Синхронизация сообщений |

### ⚙️ Админ
| Method | Endpoint | Описание |
|--------|----------|----------|
| GET | `/admin-api/admin/stats` | Статистика системы |
| GET | `/admin-api/admin/users` | Список пользователей |
| PUT | `/admin-api/admin/users/:id/block` | Блокировка |
| PUT | `/admin-api/admin/users/:id/admin` | Права админа |
| POST | `/admin-api/admin/invites` | Создать инвайты |
| GET | `/admin-api/admin/health` | Health Check |
| GET | `/admin-api/admin/logs` | Логи действий |

---

## 🔌 WebSocket Events

### Клиент → Сервер
| Event | Описание |
|-------|----------|
| `message` | Отправка сообщения |
| `typing` | Индикатор набора текста |
| `read` | Сообщение прочитано |
| `mark_delivered` | Отметить доставку |

### Сервер → Клиент
| Event | Описание |
|-------|----------|
| `message` | Новое сообщение |
| `message_sent` | Подтверждение отправки |
| `message_status` | Статус сообщения |
| `typing` | Кто-то печатает |
| `user_offline` | Пользователь вышел |

---

## ⚙️ Конфигурация

### Переменные окружения (.env)

```bash
# Сервер
SERVER_URL=http://192.168.1.36
PORT=3000
HTTPS_PORT=3443

# База данных
POSTGRES_USER=messenger
POSTGRES_PASSWORD=<пароль>
POSTGRES_DB=messenger
DATABASE_URL=postgresql://messenger:<пароль>@postgres:5432/messenger

# Redis
REDIS_URL=redis://redis:6379

# Безопасность (ОБЯЗАТЕЛЬНО СМЕНИТЬ!)
JWT_SECRET=<32+ символов>
JWT_REFRESH_SECRET=<32+ символов>
ADMIN_API_KEY=<ключ>
FILE_ENCRYPTION_KEY=<32 символа>

# Администратор
ADMIN_NAME=admin
ADMIN_PASSWORD=<пароль>
```

### Генерация ключей

```bash
# JWT Secret (32+ символа)
openssl rand -base64 32

# JWT Refresh Secret (32+ символа)
openssl rand -base64 32

# File Encryption Key (ровно 32 символа)
openssl rand -hex 16
```

---

## 🐳 Управление Docker

```bash
# Запуск всех сервисов
docker-compose up -d

# Остановка
docker-compose down

# Пересборка
docker-compose build

# Просмотр логов
docker logs secure_messenger
docker logs messenger_nginx

# Health Check
curl -k https://localhost/api/health
```

### Volumes (данные)

| Volume | Описание |
|--------|----------|
| `messendger_postgres_data` | База данных PostgreSQL |
| `messendger_redis_data` | Кэш синхронизации (Redis) |
| `messendger_file_storage` | Загруженные файлы |

---

## 📱 Мобильное приложение

Проект включает Capacitor конфигурацию для Android.

```bash
# Сборка APK
cd android
./gradlew assembleDebug
```

Скомпилированный APK: `SecureMessenger-debug.apk`

---

## 🔒 Безопасность

| Мера | Описание |
|------|----------|
| **HTTPS** | Все соединения через SSL/TLS |
| **httpOnly Cookies** | Refresh токены недоступны для JavaScript |
| **XSS Защита** | Экранирование всех пользовательских данных |
| **CSRF Защита** | SameSite=strict cookies |
| **Rate Limiting** | Ограничение запросов на API |
| **WebSocket** | Проверка дружбы перед отправкой сообщений |
| **Файлы** | Авторизация для скачивания |

---

## 📄 Лицензия

MIT License