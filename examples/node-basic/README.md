# node-basic

Простейший Node.js пример: ловим `Error`, отправляем через `ELSClient.sendError()`.

## Запуск

```bash
npm install
ELS_API_KEY=els_live_xxxxxxxx npm start
```

Переменные окружения:
- `ELS_API_KEY` — API ключ ELS (обязательно для реальной отправки)
- `ELS_URL` — URL ELS API (default: `https://api.insoweb.ru/els`)

## Что демонстрирует

- Инициализация `ELSClient` с базовой конфигурацией
- Отправка одной ошибки через `sendError()`
- Работа в Node ESM контексте (`import.meta.url`)
