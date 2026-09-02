# HH Pilot

Стартовый full-stack проект на Next.js + TypeScript.

## Локальный запуск

```bash
npm install
npm run dev
```

После запуска приложение доступно на `http://localhost:3000`.

## Production

```bash
npm run build
npm start
```

## Конфигурация AI

AI-анализ резюме требует серверных переменных окружения. Скопируйте
`.env.example` в `.env.local` и заполните значения. Секреты передаются
только через переменные окружения и не коммитятся в репозиторий
(`.env*` исключены в `.gitignore`).

| Переменная | Обязательна | Описание |
|---|---|---|
| `AI_PROVIDER` | да | `mock` или `openai-compatible`. Отсутствует/неизвестное значение — маршрут анализа вернёт ошибку настройки (без молчаливого fallback на mock). |
| `AI_MODEL` | для `openai-compatible` | Модель провайдера, например `gpt-4o-mini`. |
| `AI_API_KEY` | для `openai-compatible` | Секретный ключ провайдера. Используется только на сервере и никогда не попадает в клиентский код. |
| `AI_BASE_URL` | нет | Base URL OpenAI-compatible API. По умолчанию `https://api.openai.com/v1`. |

`AI_PROVIDER=mock` — явный development-режим с детерминированным ответом;
для production используйте `openai-compatible` с заполненными `AI_MODEL`
и `AI_API_KEY`.

Дополнительные настройки лимитов (опционально): `AI_RATE_LIMIT_MAX`,
`AI_RATE_LIMIT_WINDOW_MS`, `AI_CONCURRENCY_MAX` — см. `lib/rate-limit.ts`.

## Структура

- `app/` — страницы и layout
- `app/page.tsx` — главная страница
- `app/globals.css` — базовые стили
- `next.config.ts` — конфигурация Next.js

Проект подготовлен как чистая база для дальнейшей разработки через coding agent.
