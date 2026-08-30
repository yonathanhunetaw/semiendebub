# Database Replication Architecture (Master-Slave)

To ensure high availability, local mirroring, and real-time data redundancy across environments, we implemented a **One-Way Master-to-Slave (Primary-to-Replica) MySQL Replication** setup connected over a secure ZeroTier virtual network.

---

## 🏗️ Architecture Overview

The system consists of three nodes communicating over dedicated ZeroTier IP addresses:

| Node | Role | Host IP | Description |
| :--- | :--- | :--- | :--- |
| **Node 1** | **Master (Primary)** | `10.216.254.10` | Ubuntu Server hosting the primary database. Handles all live application write operations (INSERT, UPDATE, DELETE) and logs changes to the binary log (`binlog`). |
| **Node 2** | **Replica (Mirror)** | `10.216.254.127` | MacBook Pro running a production container mirror. Connects to the master to pull and apply transaction logs in real time. |
| **Node 3** | **Replica (Mirror)** | *(Pi IP)* | Raspberry Pi running a secondary background replica for failover, backups, or local media stack support. |

---

## ⚙️ How It Works

1. **Binary Logging on Master:** Every write mutation executed on the Ubuntu master is recorded sequentially into MySQL binary log files (`mysql-bin.0000xx`).
2. **Dedicated Replicator Account:** A secure MySQL user (`replicator`) with `REPLICATION SLAVE` privileges handles cross-node authentication.
3. **IO and SQL Threads on Replicas:** 
   * The **I/O Thread** connects to the Master over port `3309`, reads the binary log events, and saves them locally as relay logs.
   * The **SQL Thread** reads the local relay logs and executes the exact same queries against the replica database.
4. **Consistency:** Both replicas run in a continuous sync state (`Seconds_Behind_Master: 0`), mirroring the master instantly without manual intervention.

---

## 🔒 Important Operational Rule

* **Write Only to the Master (`10.216.254.10`):** All application write operations must go through the Ubuntu server. 
* **Read-Only Replicas:** The Mac and Raspberry Pi databases act as read-only mirrors. Writing directly to the replicas will cause primary key conflicts and break the replication chain.