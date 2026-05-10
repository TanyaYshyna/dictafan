🚀 Шпаргалка по пушингу в Git



#  сначала в девелоп а потом в продакшен (что бы были одинаковые)
git checkout develop_DB
git pull origin develop_DB
git add .
git commit -m "<build>"
git push origin develop_DB

git checkout production
git pull origin production
git merge develop_DB
git push origin production