<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';
header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

$done = rp_config() !== null;
$errors = [];
$ok = false;
$v = fn(string $k, string $d = '') => htmlspecialchars((string)($_POST[$k] ?? $d), ENT_QUOTES, 'UTF-8');

if (!$done && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $db = [
        'host' => trim((string)($_POST['host'] ?? '')),
        'port' => (int)($_POST['port'] ?? 3306) ?: 3306,
        'name' => trim((string)($_POST['dbname'] ?? '')),
        'user' => trim((string)($_POST['dbuser'] ?? '')),
        'pass' => (string)($_POST['dbpass'] ?? ''),
    ];
    $name = trim((string)($_POST['admin_name'] ?? ''));
    $email = strtolower(trim((string)($_POST['admin_email'] ?? '')));
    $pass = (string)($_POST['admin_pass'] ?? '');
    $pass2 = (string)($_POST['admin_pass2'] ?? '');

    if ($db['host'] === '' || $db['name'] === '' || $db['user'] === '') $errors[] = 'Renseignez le serveur, le nom et l’utilisateur de la base.';
    if ($name === '') $errors[] = 'Renseignez votre nom.';
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'L’adresse e-mail n’est pas valide.';
    if (mb_strlen($pass) < 10) $errors[] = 'Le mot de passe doit faire au moins 10 caractères.';
    if ($pass !== $pass2) $errors[] = 'Les deux mots de passe ne correspondent pas.';

    if (!$errors) {
        try {
            $pdo = rp_pdo($db);
            foreach (rp_schema() as $sql) $pdo->exec($sql);
            foreach (['data', 'data/uploads', 'data/sessions'] as $d) {
                if (!is_dir(__DIR__ . "/$d")) @mkdir(__DIR__ . "/$d", 0755, true);
                if (!is_writable(__DIR__ . "/$d")) throw new RuntimeException("Le dossier $d n’est pas accessible en écriture.");
            }
            $count = (int)$pdo->query('SELECT COUNT(*) FROM rp_users')->fetchColumn();
            if ($count === 0) {
                $pdo->prepare('INSERT INTO rp_users (email, name, pass, role, created_at) VALUES (?, ?, ?, ?, ?)')
                    ->execute([$email, $name, password_hash($pass, PASSWORD_DEFAULT), 'admin', rp_now()]);
            }
            $cfg = ['db' => $db, 'installed_at' => rp_now()];
            $php = "<?php\n// Fichier généré par install.php. Ne pas partager.\nreturn " . var_export($cfg, true) . ";\n";
            if (@file_put_contents(__DIR__ . '/config.php', $php, LOCK_EX) === false) {
                throw new RuntimeException('Impossible d’écrire config.php : vérifiez les droits du dossier.');
            }
            @chmod(__DIR__ . '/config.php', 0600);
            $ok = true;
            $done = true;
        } catch (PDOException $e) {
            $errors[] = 'Connexion à la base impossible. Vérifiez le serveur, le nom de la base, l’utilisateur et le mot de passe.';
        } catch (Throwable $e) {
            $errors[] = $e->getMessage();
        }
    }
}
?><!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Installation · RondPoint</title>
<style>
:root{--bg:#F2F4F7;--surface:#fff;--line:#DBE0E7;--fg:#131720;--muted:#5B6372;--accent:#2952DB;--bad:#BE332A;--bad-soft:#FBE4E1;--good:#1B7A52;--good-soft:#DFF2E8}
@media (prefers-color-scheme:dark){:root{--bg:#0E1014;--surface:#161920;--line:#292E38;--fg:#E7E9EE;--muted:#9DA4B1;--accent:#7290FF;--bad:#F06A5F;--bad-soft:#3A1916;--good:#45C48C;--good-soft:#14301F;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:40px 16px}
.box{max-width:560px;margin:0 auto;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:28px}
h1{margin:0 0 4px;font-size:24px}
h2{font-size:15px;margin:24px 0 10px}
p{margin:0 0 12px;color:var(--muted)}
label{display:block;font-size:13px;font-weight:600;margin:10px 0 4px}
input{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);font:inherit}
.row{display:grid;grid-template-columns:1fr 110px;gap:10px}
button,.btn{display:inline-block;margin-top:22px;padding:10px 18px;border:0;border-radius:8px;background:var(--accent);color:#fff;font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
.err{background:var(--bad-soft);color:var(--bad);padding:10px 14px;border-radius:8px;margin:12px 0}
.ok{background:var(--good-soft);color:var(--good);padding:10px 14px;border-radius:8px;margin:12px 0}
small{color:var(--muted);font-size:12.5px}
</style>
</head>
<body>
<div class="box">
<h1>Installation de RondPoint</h1>
<?php if ($ok): ?>
  <div class="ok">Installation terminée : la base est prête et votre compte administrateur est créé.</div>
  <p>Par sécurité, supprimez le fichier <b>install.php</b> de votre hébergement. Il est de toute façon bloqué maintenant que l’installation est faite.</p>
  <a class="btn" href="./">Ouvrir RondPoint</a>
<?php elseif ($done): ?>
  <p>RondPoint est déjà installé. Pour recommencer, supprimez d’abord le fichier config.php de l’hébergement.</p>
  <a class="btn" href="./">Ouvrir RondPoint</a>
<?php else: ?>
  <p>Saisissez les identifiants de la base MySQL créée dans votre espace OVH, puis votre compte administrateur.</p>
  <?php foreach ($errors as $e): ?><div class="err"><?= htmlspecialchars($e, ENT_QUOTES, 'UTF-8') ?></div><?php endforeach; ?>
  <form method="post" autocomplete="off">
    <h2>Base de données</h2>
    <div class="row">
      <div><label for="host">Serveur</label><input id="host" name="host" value="<?= $v('host') ?>" placeholder="xxxxxx.mysql.db" required></div>
      <div><label for="port">Port</label><input id="port" name="port" value="<?= $v('port', '3306') ?>" inputmode="numeric"></div>
    </div>
    <label for="dbname">Nom de la base</label><input id="dbname" name="dbname" value="<?= $v('dbname') ?>" required>
    <label for="dbuser">Utilisateur</label><input id="dbuser" name="dbuser" value="<?= $v('dbuser') ?>" required>
    <label for="dbpass">Mot de passe de la base</label><input id="dbpass" name="dbpass" type="password" required>
    <small>Ces informations figurent dans l’onglet « Bases de données » de votre hébergement OVH.</small>
    <h2>Votre compte administrateur</h2>
    <label for="admin_name">Nom</label><input id="admin_name" name="admin_name" value="<?= $v('admin_name') ?>" required>
    <label for="admin_email">E-mail</label><input id="admin_email" name="admin_email" type="email" value="<?= $v('admin_email') ?>" required>
    <label for="admin_pass">Mot de passe (10 caractères minimum)</label><input id="admin_pass" name="admin_pass" type="password" minlength="10" autocomplete="new-password" required>
    <label for="admin_pass2">Confirmer le mot de passe</label><input id="admin_pass2" name="admin_pass2" type="password" minlength="10" autocomplete="new-password" required>
    <button type="submit">Installer</button>
  </form>
<?php endif; ?>
</div>
</body>
</html>
