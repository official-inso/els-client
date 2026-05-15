# node-batch

Пример batch-отправки с использованием `ELSQueue` и `client.sendBatch()`.

## Запуск

```bash
npm install
ELS_API_KEY=els_live_xxxxxxxx npm start
```

## Что демонстрирует

- `ELSQueue` с `flushIntervalMs` и `maxBatchSize`
- Автоматический флаш по таймеру и по размеру буфера
- Прямой вызов `client.sendBatch([...])`
- Graceful shutdown на `SIGINT`/`SIGTERM` с финальным `queue.flush()`
