# @inso_web/els-client — Examples

Runnable примеры использования vanilla TypeScript клиента ELS.

## Доступные примеры

- **[node-basic](./node-basic/)** — простой Node.js sender, отправка одной ошибки.
- **[node-batch](./node-batch/)** — отправка batch из 50 ошибок + graceful shutdown.
- **[browser-vanilla](./browser-vanilla/)** — HTML + vanilla JS через esm.sh CDN, авто-перехват глобальных ошибок.

## Общее

Все примеры используют **опубликованную** версию `@inso_web/els-client@^0.2.0` из npm.

Для запуска нужен API key ELS (формат `els_live_...`). Получить можно у администратора платформы.

ELS API в проде: `https://api.insoweb.ru/els`
