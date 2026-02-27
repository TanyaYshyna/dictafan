🚀 Шпаргалка по пушингу в Git

## 📋 Два режима работы

### 🌞 В течение дня (разработка в ветке `develop`):
```bash
git checkout develop
git add .
git commit -m "Описание изменений"
git push origin develop
```

### 🌙 Ночью (деплой на продакшн):
```bash
# Используй скрипт (проще всего):
./deploy_to_production.sh

# Или вручную:
git checkout main
git pull origin main
git merge develop
git push origin main
git checkout develop
```

---

## 📝 Основные команды

1️⃣ Добавить файлы в индекс (подготовить к коммиту):

git add имя_файла
# или добавить всё
git add .

2️⃣ Сделать коммит с сообщением:

git commit -m "Min-min 051"

3️⃣ Отправить изменения в удалённый репозиторий:

git push

(если настроен origin и ветка, обычно это main или master)

Если первая отправка ветки:

git push -u origin имя_ветки

Например:

git push -u origin main

💡 Полезные команды

✅ Проверить статус:

git status

✅ Посмотреть историю коммитов:

git log --oneline

✅ Клонировать проект:

git clone ссылка_на_репозиторий

✅ Переключиться на другую ветку:

git checkout имя_ветки

✅ Создать новую ветку и сразу переключиться:

git checkout -b имя_новой_ветки

📝 Пример полного цикла (в течение дня)

git checkout develop
git add .
git commit -m "Добавила новый функционал диктанта"
git push origin develop

⚠️ Если push не проходит

Проверить настройку origin:

git remote -v

Обновить локальную ветку перед пушем:

git pull

Сделай сейчас дамп всех установленных библиотек — пригодится в будущем:
pip freeze > requirements.txt


получить из гита
git fetch --all
git reset --hard origin/main


git rm -r --cached static/data/dictations static/data/temp static/data/users


Railway - основной хостинг:
🔗 https://railway.app/

Backblaze B2 - хранилище для аудио:
🔗 https://www.backblaze.com/b2/cloud-storage.html


git checkout develop_DB
# Переключает тебя на ветку develop_DB (код/файлы в папке станут как в этой ветке)
 
git pull origin develop_DB
# Скачивает последние изменения с GitHub (origin) и сразу “вливает” их в твою локальную ветку develop_DB
# (обновляет её до актуального состояния)
 
git status
# Показывает текущее состояние: какие файлы изменены, какие добавлены, что готово к коммиту (staged)
 
git add .
# Добавляет ВСЕ изменения в текущей папке/репоызитории в “staging” (готовит их к коммиту)
 
git commit -m "0079"
# Создаёт коммит (снимок) из того, что в staging, с твоим сообщением
 
git push origin develop_DB
# Отправляет твои новые коммиты в ветку develop_DB на GitHub (origin)