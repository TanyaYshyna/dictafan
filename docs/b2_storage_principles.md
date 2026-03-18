# 🎯 Принципы работы с Backblaze B2 в Dictafan

## 📊 Текущая ситуация

### Структура хранения данных:

```
.../
├── dictations/          ← Финальные диктанты (аудио)
│   └── dicta_<id_dict>/
│       ├── en/
│       │   └── *.mp3
│       └── ru/
│           └── *.mp3
│
├── dictations_covers/   ← коверы диктантов
│   └── dictation_123/
│       └── <id_dict>.webp
│
├── books_covers/   ← коверы книг
│   └── <id_book>.webp
│
├── avatars/   ← аватары пользователей
│   └── iser_<id_user>/
│       ├── avatar.webp
│       └── avatar_min.webp

```