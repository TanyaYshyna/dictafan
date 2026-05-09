🚀 Шпаргалка по пушингу в Git



#  сначала в девелоп а потом в продакшен (что бы были одинаковые)
git checkout develop_DB
git add .
git commit -m "0574"
git push origin develop_DB

git checkout production
git pull origin production
git merge origin/develop_DB
git push origin production