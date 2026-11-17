<?php
declare(strict_types=1);

const RP_VERSION = '1.2.0';
const RP_KINDS = ['client', 'project', 'person', 'gear', 'res', 'doc', 'setting'];

function rp_config(): ?array
{
    $f = __DIR__ . '/config.php';
    if (!is_file($f)) return null;
    $c = require $f;
    return is_array($c) ? $c : null;
}

function rp_pdo(array $db): PDO
{
    $dsn = 'mysql:host=' . $db['host'] . ';dbname=' . $db['name'] . ';charset=utf8mb4';
    if (!empty($db['port'])) $dsn .= ';port=' . (int)$db['port'];
    return new PDO($dsn, $db['user'], $db['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}

function rp_now(): string
{
    return gmdate('Y-m-d H:i:s');
}

function rp_schema(): array
{
    $opt = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    return [
        "CREATE TABLE IF NOT EXISTS rp_users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(190) NOT NULL UNIQUE,
            name VARCHAR(120) NOT NULL,
            pass VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'member',
            created_at DATETIME NOT NULL,
            last_login DATETIME NULL
        ) $opt",
        "CREATE TABLE IF NOT EXISTS rp_entities (
            kind VARCHAR(20) NOT NULL,
            id VARCHAR(40) NOT NULL,
            data LONGTEXT NOT NULL,
            version INT NOT NULL DEFAULT 1,
            deleted TINYINT NOT NULL DEFAULT 0,
            updated_at DATETIME NOT NULL,
            updated_by INT NULL,
            PRIMARY KEY (kind, id)
        ) $opt",
        "CREATE TABLE IF NOT EXISTS rp_history (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            kind VARCHAR(20) NOT NULL,
            eid VARCHAR(40) NOT NULL,
            data LONGTEXT NULL,
            version INT NOT NULL,
            action VARCHAR(10) NOT NULL,
            at DATETIME NOT NULL,
            user_id INT NULL,
            INDEX (kind, eid)
        ) $opt",
        "CREATE TABLE IF NOT EXISTS rp_files (
            id VARCHAR(40) PRIMARY KEY,
            project_id VARCHAR(40) NOT NULL,
            tag VARCHAR(20) NOT NULL DEFAULT 'doc',
            name VARCHAR(255) NOT NULL,
            size BIGINT NOT NULL,
            mime VARCHAR(120) NOT NULL,
            stored_name VARCHAR(80) NOT NULL,
            uploaded_at DATETIME NOT NULL,
            user_id INT NULL,
            deleted TINYINT NOT NULL DEFAULT 0,
            INDEX (project_id)
        ) $opt",
        "CREATE TABLE IF NOT EXISTS rp_logins (
            ip VARCHAR(64) NOT NULL,
            at DATETIME NOT NULL,
            INDEX (ip, at)
        ) $opt",
    ];
}

function rp_bytes(string $v): int
{
    $v = trim($v);
    if ($v === '') return 0;
    $n = (float)$v;
    switch (strtolower(substr($v, -1))) {
        case 'g': $n *= 1024;
        // no break
        case 'm': $n *= 1024;
        // no break
        case 'k': $n *= 1024;
    }
    return (int)$n;
}

function rp_max_upload(): int
{
    $a = rp_bytes((string)ini_get('upload_max_filesize'));
    $b = rp_bytes((string)ini_get('post_max_size'));
    if ($a <= 0) return $b;
    if ($b <= 0) return $a;
    return min($a, $b);
}
