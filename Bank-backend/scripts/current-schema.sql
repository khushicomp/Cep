-- Empty MySQL 8 database only. Apply through current-schema.js with explicit acknowledgement.
-- No data, legacy tables, session changes or FK bypasses. Credential times are UTC; report times are India-local.

CREATE TABLE `branches` (
  `branch_id` int NOT NULL AUTO_INCREMENT,
  `branch_code` varchar(20) NOT NULL,
  `branch_name` varchar(150) NOT NULL,
  `branch_address` text,
  `branch_city` varchar(100) DEFAULT NULL,
  `branch_district` varchar(100) DEFAULT NULL,
  `branch_state` varchar(100) DEFAULT NULL,
  `branch_pincode` varchar(10) DEFAULT NULL,
  `branch_email` varchar(100) DEFAULT NULL,
  `branch_phone` varchar(50) DEFAULT NULL,
  `branch_type` varchar(50) DEFAULT 'Branch',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`branch_id`),
  UNIQUE KEY `branch_code` (`branch_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `role` enum('EMPLOYEE','MANAGER','ADMIN','HEAD_OFFICE') NOT NULL DEFAULT 'MANAGER',
  `branch_id` int DEFAULT NULL,
  `branch_code` varchar(20) DEFAULT NULL,
  `branch_name` varchar(150) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `joining_date` date DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `can_view_own_branch` tinyint(1) DEFAULT '1',
  `can_view_all_branches` tinyint(1) DEFAULT '0',
  `can_edit_reports` tinyint(1) DEFAULT '0',
  `can_delete_reports` tinyint(1) DEFAULT '0',
  `account_state` enum('INVITED','ACTIVE','DISABLED') NOT NULL DEFAULT 'INVITED',
  `auth_version` int unsigned NOT NULL DEFAULT '0',
  `password_changed_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`),
  KEY `branch_id` (`branch_id`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `daily_business_entries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `branch_id` int NOT NULL,
  `manager_id` int NOT NULL,
  `entry_date` date NOT NULL,
  `total_amount` decimal(15,2) DEFAULT '0.00',
  `status` varchar(50) DEFAULT 'draft',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `branch_code` varchar(20) DEFAULT NULL,
  `branch_name` varchar(150) DEFAULT NULL,
  `manager_name` varchar(100) DEFAULT NULL,
  `total_entries` int DEFAULT '0',
  `submitted_at` datetime DEFAULT NULL,
  `unlock_requested` tinyint(1) NOT NULL DEFAULT '0',
  `unlock_reason` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_branch_entry_date` (`branch_id`,`entry_date`),
  KEY `phase1_entry_manager_fk` (`manager_id`),
  CONSTRAINT `phase1_entry_branch_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`branch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `phase1_entry_manager_fk` FOREIGN KEY (`manager_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `daily_business_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `entry_id` int NOT NULL,
  `sr_no` int NOT NULL,
  `account_type` varchar(100) NOT NULL,
  `status` varchar(50) NOT NULL,
  `amount` decimal(15,2) DEFAULT '0.00',
  `remark` text,
  PRIMARY KEY (`id`),
  KEY `entry_id` (`entry_id`),
  CONSTRAINT `daily_business_items_ibfk_1` FOREIGN KEY (`entry_id`) REFERENCES `daily_business_entries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `daily_business_audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `entry_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `action` varchar(50) NOT NULL,
  `actor_id` int NOT NULL,
  `actor_role` varchar(50) NOT NULL,
  `actor_name` varchar(100) NOT NULL,
  `previous_state` json DEFAULT NULL,
  `new_state` json DEFAULT NULL,
  `reason` text,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `branch_id` (`branch_id`),
  KEY `actor_id` (`actor_id`),
  KEY `phase1_audit_entry_fk` (`entry_id`),
  CONSTRAINT `daily_business_audit_logs_ibfk_2` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`branch_id`),
  CONSTRAINT `daily_business_audit_logs_ibfk_3` FOREIGN KEY (`actor_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `phase1_audit_entry_fk` FOREIGN KEY (`entry_id`) REFERENCES `daily_business_entries` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE account_action_tokens (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    purpose ENUM('SETUP','RESET') NOT NULL,
    token_hash BINARY(32) NOT NULL,
    auth_version INT UNSIGNED NOT NULL,
    created_at DATETIME(6) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    used_at DATETIME(6) NULL,
    revoked_at DATETIME(6) NULL,
    UNIQUE KEY token_hash (token_hash),
    KEY user_purpose (user_id, purpose),
    KEY expires_at (expires_at),
    CONSTRAINT phase5d_token_user_fk FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE account_security_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    subject_user_id INT NOT NULL,
    actor_user_id INT NULL,
    actor_source VARCHAR(40) NOT NULL,
    operator_reference VARCHAR(100) NULL,
    action VARCHAR(50) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    KEY subject_timeline (subject_user_id, created_at),
    KEY actor (actor_user_id),
    CONSTRAINT phase5d_event_subject_fk FOREIGN KEY (subject_user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT phase5d_event_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
