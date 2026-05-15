# browser-vanilla

Статичный HTML пример: подключает `@inso_web/els-client` через esm.sh CDN, без сборщиков.

## Запуск

```bash
# Вариант 1: Python
python3 -m http.server 8080

# Вариант 2: npx serve
npx serve .
```

Затем открой `http://localhost:8080/` в браузере. При загрузке страница попросит ввести API key (`els_live_...`).

## Что демонстрирует

- Загрузка пакета с esm.sh через `<script type="importmap">`
- Ручная отправка ошибки по клику
- Авто-перехват `window.error` и `unhandledrejection`
- Использование `source: 'client'` и `userAgent`
