🚀 Шпаргалка по пушингу в Git



# Сначала в develop_DB, потом в production (чтобы номера билдов были одинаковые)
git checkout develop_DB
git pull origin develop_DB
git add .
git commit -m "<build>"
git push origin develop_DB

git checkout production
git pull origin production
# ВАЖНО: чтобы в GitHub Deployments в production показывался тот же номер <build>,
# делаем fast-forward merge (без merge-коммита):
git merge --ff-only develop_DB

# Если Git пишет, что ff-only невозможен (или открывает редактор MERGE_MSG),
# значит production и develop_DB разошлись.
# Тогда можно завершить merge вручную с сообщением (чтобы не открывался редактор):
# git merge develop_DB
# git commit -m "merge develop_DB into production"

git push origin production