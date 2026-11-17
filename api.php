<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function out(array $d, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($d, JSON_UNESCAPED_UNICODE);
    exit;
}

function valid_id($id): bool
{
    return is_string($id) && preg_match('/^[A-Za-z0-9_]{1,40}$/', $id) === 1;
}

$cfg = rp_config();
if (!$cfg) out(['error' => "RondPoint n'est pas encore installé. Ouvrez install.php.", 'install' => true], 503);

try {
    $pdo = rp_pdo($cfg['db']);
} catch (Throwable $e) {
    out(['error' => 'Connexion à la base de données impossible. Réessayez dans un instant.'], 500);
}

/* ---------- Session ---------- */
$sessDir = __DIR__ . '/data/sessions';
if (is_dir($sessDir) && is_writable($sessDir)) session_save_path($sessDir);
ini_set('session.gc_maxlifetime', '2592000');
ini_set('session.use_strict_mode', '1');
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
    || (($_SERVER['SERVER_PORT'] ?? '') === '443');
session_name('rp_sess');
session_set_cookie_params([
    'lifetime' => 2592000,
    'path' => '/',
    'secure' => $https,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

$a = (string)($_GET['a'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$in = [];
if ($method === 'POST' && str_contains((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) {
    $raw = file_get_contents('php://input');
    $in = json_decode($raw ?: '[]', true);
    if (!is_array($in)) out(['error' => 'Requête illisible.'], 400);
}

function current_user(PDO $pdo): ?array
{
    if (empty($_SESSION['uid'])) return null;
    $st = $pdo->prepare('SELECT id, email, name, role FROM rp_users WHERE id = ?');
    $st->execute([(int)$_SESSION['uid']]);
    $u = $st->fetch();
    return $u ?: null;
}

function public_user(array $u): array
{
    return ['id' => (int)$u['id'], 'email' => $u['email'], 'name' => $u['name'], 'role' => $u['role']];
}

/* ---------- Connexion ---------- */
if ($a === 'login') {
    if ($method !== 'POST') out(['error' => 'Méthode invalide.'], 405);
    $ip = substr((string)($_SERVER['REMOTE_ADDR'] ?? '?'), 0, 64);
    $pdo->prepare('DELETE FROM rp_logins WHERE at < ?')->execute([gmdate('Y-m-d H:i:s', time() - 3600)]);
    $st = $pdo->prepare('SELECT COUNT(*) FROM rp_logins WHERE ip = ? AND at > ?');
    $st->execute([$ip, gmdate('Y-m-d H:i:s', time() - 900)]);
    if ((int)$st->fetchColumn() >= 8) out(['error' => 'Trop de tentatives. Réessayez dans 15 minutes.'], 429);

    $email = strtolower(trim((string)($in['email'] ?? '')));
    $pass = (string)($in['password'] ?? '');
    $st = $pdo->prepare('SELECT * FROM rp_users WHERE email = ?');
    $st->execute([$email]);
    $u = $st->fetch();
    if (!$u || !password_verify($pass, $u['pass'])) {
        $pdo->prepare('INSERT INTO rp_logins (ip, at) VALUES (?, ?)')->execute([$ip, rp_now()]);
        usleep(400000);
        out(['error' => 'E-mail ou mot de passe incorrect.'], 401);
    }
    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$u['id'];
    $_SESSION['csrf'] = bin2hex(random_bytes(16));
    $pdo->prepare('UPDATE rp_users SET last_login = ? WHERE id = ?')->execute([rp_now(), $u['id']]);
    out(['ok' => true]);
}

$me = current_user($pdo);

if ($a === 'me') {
    if (!$me) out(['error' => 'Non connecté.'], 401);
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
    out(['user' => public_user($me), 'csrf' => $_SESSION['csrf'], 'maxUpload' => rp_max_upload(), 'version' => RP_VERSION]);
}

if (!$me) out(['error' => 'Session expirée, reconnectez-vous.'], 401);
if ($method === 'POST' && !hash_equals((string)($_SESSION['csrf'] ?? ''), (string)($_SERVER['HTTP_X_CSRF'] ?? ''))) {
    out(['error' => 'Jeton de sécurité invalide : rechargez la page.'], 403);
}
$isAdmin = $me['role'] === 'admin';
$uid = (int)$me['id'];

function list_users(PDO $pdo, bool $full): array
{
    $rows = $pdo->query('SELECT id, name, email, role, last_login FROM rp_users ORDER BY name')->fetchAll();
    return array_map(function ($r) use ($full) {
        $o = ['id' => (int)$r['id'], 'name' => $r['name']];
        if ($full) $o += ['email' => $r['email'], 'role' => $r['role'], 'last_login' => $r['last_login']];
        return $o;
    }, $rows);
}

function file_row(array $r): array
{
    return [
        'id' => $r['id'], 'project_id' => $r['project_id'], 'tag' => $r['tag'], 'name' => $r['name'],
        'size' => (int)$r['size'], 'mime' => $r['mime'], 'uploaded_at' => $r['uploaded_at'], 'user_id' => (int)$r['user_id'],
    ];
}

switch ($a) {
    case 'logout':
        $_SESSION = [];
        session_destroy();
        out(['ok' => true]);

    case 'bootstrap':
        $ents = array_fill_keys(RP_KINDS, []);
        foreach ($pdo->query('SELECT kind, data, version FROM rp_entities WHERE deleted = 0') as $r) {
            if (!isset($ents[$r['kind']])) continue;
            $ents[$r['kind']][] = ['v' => (int)$r['version'], 'd' => json_decode($r['data'], true)];
        }
        $files = array_map('file_row', $pdo->query('SELECT * FROM rp_files WHERE deleted = 0 ORDER BY uploaded_at DESC')->fetchAll());
        out(['entities' => $ents, 'files' => $files, 'users' => list_users($pdo, $isAdmin)]);

    case 'save':
    case 'delete':
        if ($method !== 'POST') out(['error' => 'Méthode invalide.'], 405);
        $kind = (string)($in['kind'] ?? '');
        $id = $in['id'] ?? '';
        $base = (int)($in['version'] ?? 0);
        if (!in_array($kind, RP_KINDS, true) || !valid_id($id)) out(['error' => 'Élément invalide.'], 400);
        $json = null;
        if ($a === 'save') {
            $data = $in['data'] ?? null;
            if (!is_array($data)) out(['error' => 'Données invalides.'], 400);
            $data['id'] = $id;
            $json = json_encode($data, JSON_UNESCAPED_UNICODE);
            if ($json === false || strlen($json) > 4000000) out(['error' => 'Élément trop volumineux.'], 413);
        }
        $pdo->beginTransaction();
        $st = $pdo->prepare('SELECT data, version, deleted FROM rp_entities WHERE kind = ? AND id = ? FOR UPDATE');
        $st->execute([$kind, $id]);
        $cur = $st->fetch();
        $curVer = $cur ? (int)$cur['version'] : 0;
        if ($curVer !== $base) {
            $pdo->rollBack();
            $current = ($cur && !(int)$cur['deleted']) ? ['v' => $curVer, 'd' => json_decode($cur['data'], true)] : null;
            out(['error' => 'conflict', 'current' => $current], 409);
        }
        $v = $curVer + 1;
        if ($a === 'save') {
            if ($cur) {
                $pdo->prepare('UPDATE rp_entities SET data = ?, version = ?, deleted = 0, updated_at = ?, updated_by = ? WHERE kind = ? AND id = ?')
                    ->execute([$json, $v, rp_now(), $uid, $kind, $id]);
            } else {
                $pdo->prepare('INSERT INTO rp_entities (kind, id, data, version, deleted, updated_at, updated_by) VALUES (?, ?, ?, ?, 0, ?, ?)')
                    ->execute([$kind, $id, $json, $v, rp_now(), $uid]);
            }
        } else {
            if (!$cur) { $pdo->rollBack(); out(['ok' => true, 'version' => 0]); }
            $pdo->prepare('UPDATE rp_entities SET deleted = 1, version = ?, updated_at = ?, updated_by = ? WHERE kind = ? AND id = ?')
                ->execute([$v, rp_now(), $uid, $kind, $id]);
            $json = $cur['data'];
        }
        $pdo->prepare('INSERT INTO rp_history (kind, eid, data, version, action, at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
            ->execute([$kind, $id, $json, $v, $a, rp_now(), $uid]);
        $pdo->commit();
        out(['ok' => true, 'version' => $v]);

    case 'upload':
        if ($method !== 'POST') out(['error' => 'Méthode invalide.'], 405);
        $pid = $_POST['project_id'] ?? '';
        $tag = in_array($_POST['tag'] ?? 'doc', ['doc', 'justif', 'video'], true) ? $_POST['tag'] : 'doc';
        if (!valid_id($pid)) out(['error' => 'Projet invalide.'], 400);
        if (empty($_FILES['file']) || !is_array($_FILES['file']['error'])) {
            $f = $_FILES['file'] ?? null;
        } else {
            out(['error' => 'Un seul fichier par envoi.'], 400);
        }
        if (!$f) out(['error' => "Fichier trop lourd pour l'hébergement, ou envoi interrompu."], 400);
        if ($f['error'] !== UPLOAD_ERR_OK) {
            $msg = in_array($f['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)
                ? "Fichier trop lourd pour l'hébergement."
                : "L'envoi du fichier a échoué. Réessayez.";
            out(['error' => $msg], 400);
        }
        if (!is_uploaded_file($f['tmp_name'])) out(['error' => 'Envoi invalide.'], 400);
        $name = preg_replace('/[\x00-\x1F\x7F\/\\\\]/u', '', (string)$f['name']) ?: 'fichier';
        $name = mb_substr($name, 0, 200);
        $dir = __DIR__ . '/data/uploads';
        if (!is_dir($dir) && !mkdir($dir, 0755, true)) out(['error' => 'Dossier de stockage indisponible.'], 500);
        $stored = bin2hex(random_bytes(16));
        if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $stored)) out(['error' => "Impossible d'enregistrer le fichier."], 500);
        $mime = 'application/octet-stream';
        if (function_exists('finfo_open')) {
            $fi = finfo_open(FILEINFO_MIME_TYPE);
            $mime = (string)(finfo_file($fi, $dir . '/' . $stored) ?: $mime);
        }
        $row = [
            'id' => 'f' . bin2hex(random_bytes(8)), 'project_id' => $pid, 'tag' => $tag, 'name' => $name,
            'size' => (int)$f['size'], 'mime' => substr($mime, 0, 120), 'stored' => $stored,
            'uploaded_at' => rp_now(), 'user_id' => $uid,
        ];
        $pdo->prepare('INSERT INTO rp_files (id, project_id, tag, name, size, mime, stored, uploaded_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute(array_values($row));
        out(['ok' => true, 'file' => file_row($row)]);

    case 'file':
        $id = $_GET['id'] ?? '';
        if (!valid_id($id)) out(['error' => 'Fichier introuvable.'], 404);
        $st = $pdo->prepare('SELECT * FROM rp_files WHERE id = ? AND deleted = 0');
        $st->execute([$id]);
        $r = $st->fetch();
        $path = $r ? __DIR__ . '/data/uploads/' . $r['stored'] : '';
        if (!$r || !is_file($path)) out(['error' => 'Fichier introuvable.'], 404);
        $mime = $r['mime'];
        $inline = $mime === 'application/pdf' || str_starts_with($mime, 'video/') || str_starts_with($mime, 'audio/')
            || (str_starts_with($mime, 'image/') && $mime !== 'image/svg+xml');
        $size = filesize($path);
        $start = 0;
        $end = $size - 1;
        header('Accept-Ranges: bytes');
        if (preg_match('/bytes=(\d*)-(\d*)/', (string)($_SERVER['HTTP_RANGE'] ?? ''), $m)) {
            if ($m[1] === '' && $m[2] !== '') { $start = max(0, $size - (int)$m[2]); }
            else { $start = (int)$m[1]; if ($m[2] !== '') $end = min((int)$m[2], $size - 1); }
            if ($start > $end || $start >= $size) { header("Content-Range: bytes */$size"); http_response_code(416); exit; }
            http_response_code(206);
            header("Content-Range: bytes $start-$end/$size");
        }
        header('Content-Type: ' . ($inline ? $mime : 'application/octet-stream'));
        header('Content-Length: ' . ($end - $start + 1));
        header("Content-Security-Policy: default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
        $ascii = preg_replace('/[^A-Za-z0-9._-]/', '_', $r['name']);
        header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $ascii . '"; filename*=UTF-8\'\'' . rawurlencode($r['name']));
        header('Cache-Control: private, max-age=3600');
        session_write_close();
        $fh = fopen($path, 'rb');
        fseek($fh, $start);
        $left = $end - $start + 1;
        while ($left > 0 && !feof($fh)) {
            $chunk = fread($fh, (int)min(1048576, $left));
            if ($chunk === false) break;
            echo $chunk;
            $left -= strlen($chunk);
            flush();
        }
        fclose($fh);
        exit;

    case 'delete_file':
        $id = $in['id'] ?? '';
        if (!valid_id($id)) out(['error' => 'Fichier introuvable.'], 404);
        $st = $pdo->prepare('SELECT stored FROM rp_files WHERE id = ? AND deleted = 0');
        $st->execute([$id]);
        $r = $st->fetch();
        if ($r) {
            $pdo->prepare('UPDATE rp_files SET deleted = 1 WHERE id = ?')->execute([$id]);
            @unlink(__DIR__ . '/data/uploads/' . $r['stored']);
        }
        out(['ok' => true]);

    case 'users':
        out(['users' => list_users($pdo, $isAdmin)]);

    case 'user_save':
        if (!$isAdmin) out(['error' => 'Réservé aux administrateurs.'], 403);
        $id = (int)($in['id'] ?? 0);
        $name = trim((string)($in['name'] ?? ''));
        $email = strtolower(trim((string)($in['email'] ?? '')));
        $role = ($in['role'] ?? 'member') === 'admin' ? 'admin' : 'member';
        $pass = (string)($in['password'] ?? '');
        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) out(['error' => 'Nom et e-mail valides obligatoires.'], 400);
        if (($id === 0 || $pass !== '') && mb_strlen($pass) < 10) out(['error' => 'Le mot de passe doit faire au moins 10 caractères.'], 400);
        if ($id === $uid && $role !== 'admin') out(['error' => 'Vous ne pouvez pas retirer vos propres droits administrateur.'], 400);
        $st = $pdo->prepare('SELECT id FROM rp_users WHERE email = ? AND id <> ?');
        $st->execute([$email, $id]);
        if ($st->fetch()) out(['error' => 'Cet e-mail est déjà utilisé par un autre compte.'], 400);
        if ($id === 0) {
            $pdo->prepare('INSERT INTO rp_users (email, name, pass, role, created_at) VALUES (?, ?, ?, ?, ?)')
                ->execute([$email, $name, password_hash($pass, PASSWORD_DEFAULT), $role, rp_now()]);
        } else {
            $pdo->prepare('UPDATE rp_users SET email = ?, name = ?, role = ? WHERE id = ?')->execute([$email, $name, $role, $id]);
            if ($pass !== '') $pdo->prepare('UPDATE rp_users SET pass = ? WHERE id = ?')->execute([password_hash($pass, PASSWORD_DEFAULT), $id]);
        }
        out(['ok' => true, 'users' => list_users($pdo, true)]);

    case 'user_delete':
        if (!$isAdmin) out(['error' => 'Réservé aux administrateurs.'], 403);
        $id = (int)($in['id'] ?? 0);
        if ($id === $uid) out(['error' => 'Vous ne pouvez pas supprimer votre propre compte.'], 400);
        $pdo->prepare('DELETE FROM rp_users WHERE id = ?')->execute([$id]);
        out(['ok' => true, 'users' => list_users($pdo, true)]);

    case 'password':
        $cur = (string)($in['current'] ?? '');
        $new = (string)($in['new'] ?? '');
        $st = $pdo->prepare('SELECT pass FROM rp_users WHERE id = ?');
        $st->execute([$uid]);
        if (!password_verify($cur, (string)$st->fetchColumn())) out(['error' => 'Mot de passe actuel incorrect.'], 400);
        if (mb_strlen($new) < 10) out(['error' => 'Le nouveau mot de passe doit faire au moins 10 caractères.'], 400);
        $pdo->prepare('UPDATE rp_users SET pass = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $uid]);
        out(['ok' => true]);

    default:
        out(['error' => 'Action inconnue.'], 404);
}
