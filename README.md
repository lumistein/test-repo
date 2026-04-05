# Gemma Chat Site

전용 공개 채팅 페이지입니다. 브라우저에서는 `/api/chat`만 호출하고, 실제 모델 URL과 모델명은 서버 환경변수에서만 읽습니다.

## 로컬 실행

```bash
npm install
copy .env.example .env.local
npm run dev
```

## 필요한 환경변수

- `UPSTREAM_CHAT_COMPLETIONS_URL`
- `UPSTREAM_MODEL`
- `UPSTREAM_API_KEY`
- `SITE_TITLE`
- `SITE_DESCRIPTION`

## Vercel 배포 메모

Vercel 프로젝트 환경변수에 위 값을 넣은 뒤 배포하면 됩니다.
