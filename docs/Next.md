the tldraw canvas works in prod and dev, saves in images in minio and is on the latest version although its 
using a licence that they gave me for one year, 

baby@babys-MacBook-Pro ~ % ssh starvin@10.216.254.10 "docker exec -i duka-db mysqldump -udukauser -pdukapass duka canvas_versions --no-create-info --no-tablespaces" > ~/Documents/canvas_backup.sql
starvin@10.216.254.10's password:
mysqldump: [Warning] Using a password on the command line interface can be insecure.

this run and it did dump a back up in Documents. its important because we need to restore the tldraw canvas incase
we want to do "docker exec -it duka-app php artisan migrate:fresh --seed" which we always do.