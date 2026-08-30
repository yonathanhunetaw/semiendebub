CREATE USER IF NOT EXISTS 'replicator'@'%' IDENTIFIED BY 'secure_replication_password';
ALTER USER 'replicator'@'%' IDENTIFIED WITH mysql_native_password BY 'secure_replication_password';
GRANT REPLICATION SLAVE ON *.* TO 'replicator'@'%';
FLUSH PRIVILEGES;