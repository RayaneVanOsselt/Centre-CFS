<?php
/**
 * Centre CFS — traitement des formulaires (contact, devis, inscription).
 * PHP 8.1+. Aucune base de données : la demande est envoyée par e-mail.
 *
 * Sécurité : méthode POST uniquement, champ piège (honeypot), délai minimum de remplissage,
 * limitation de débit par IP, validation stricte, protection contre l'injection d'en-têtes,
 * échappement HTML, destinataire fixe côté serveur, réponses JSON sans détail technique.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

date_default_timezone_set('Europe/Brussels');
$config = require __DIR__ . '/config.php'; // copier config.sample.php en config.php
$catalogue = require __DIR__ . '/catalogue.php'; // généré par build.py

function reply(int $code, bool $ok, string $message = ''): never {
    http_response_code($code);
    echo json_encode(['ok' => $ok, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    reply(405, false, 'Méthode non autorisée.');
}

// Même origine uniquement
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && !in_array($origin, $config['allowed_origins'], true)) {
    reply(403, false, 'Origine refusée.');
}

// Champ piège : les robots le remplissent, les humains ne le voient pas
if (!empty($_POST['website'])) {
    reply(200, true); // on fait croire au robot que tout s'est bien passé
}

// Temps passé sur le formulaire, mesuré par le navigateur (les robots sans JavaScript n'envoient rien)
$elapsed = (int)($_POST['_t'] ?? 0);
if ($elapsed < 3000 || $elapsed > 7200000) {
    reply(400, false, 'Merci de recharger la page et de réessayer.');
}

// Limitation de débit : 5 envois / 10 min par IP (fichier temporaire, sans données personnelles en clair)
$ipHash = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . $config['salt']);
$rlFile = sys_get_temp_dir() . '/cfs_rl_' . $ipHash;
$now = time();
$hits = is_file($rlFile) ? array_filter(array_map('intval', explode(',', (string)file_get_contents($rlFile))), fn($h) => $h > $now - 600) : [];
if (count($hits) >= 5) {
    reply(429, false, 'Trop de demandes. Réessayez dans quelques minutes ou appelez-nous.');
}
$hits[] = $now;
file_put_contents($rlFile, implode(',', $hits), LOCK_EX);

// Nettoyage
function field(string $k, int $max = 200): string {
    $v = $_POST[$k] ?? '';
    if (!is_string($v)) return '';
    $v = trim(str_replace(["\r", "\0"], '', $v));
    return mb_substr($v, 0, $max);
}
function oneLine(string $v): string { return preg_replace('/[\n\t]+/', ' ', $v) ?? ''; }

$form = field('form', 20);
if (!in_array($form, ['contact', 'inscription'], true)) {
    reply(400, false, 'Formulaire inconnu.');
}
if (field('consent', 2) !== '1') {
    reply(422, false, 'Le consentement est requis.');
}

$email = oneLine(field('email', 160));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    reply(422, false, 'Adresse e-mail invalide.');
}
$tel = oneLine(field('tel', 30));
if ($tel !== '' && !preg_match('/^[+0-9 ()\.\/-]{8,20}$/', $tel)) {
    reply(422, false, 'Numéro de téléphone invalide.');
}

$allowedTypes = ['inscription' => 'Inscription', 'intra' => 'Formation en entreprise (devis)', 'salle' => 'Location de salle', 'autre' => 'Autre'];
$slugOk = fn(string $s) => $s === '' || isset($catalogue['formations'][$s]);
$fName = fn(string $s) => $catalogue['formations'][$s] ?? '—';

$lines = [];
if ($form === 'contact') {
    $type = field('type', 20);
    if (!isset($allowedTypes[$type])) reply(422, false, 'Objet de la demande invalide.');
    $prenom = oneLine(field('prenom', 80)); $nom = oneLine(field('nom', 80)); $message = field('message', 5000);
    $formation = field('formation', 60);
    if ($prenom === '' || $nom === '' || $message === '' || !$slugOk($formation)) reply(422, false, 'Champs obligatoires manquants.');
    $subject = 'Site web — ' . $allowedTypes[$type] . ' — ' . $prenom . ' ' . $nom;
    $lines = [
        'Objet' => $allowedTypes[$type], 'Formation' => $formation ? $fName($formation) : '—',
        'Nom' => "$prenom $nom", 'E-mail' => $email, 'Téléphone' => $tel ?: '—',
        'Entreprise' => oneLine(field('entreprise', 160)) ?: '—', 'Message' => $message,
    ];
} else {
    $formation = field('formation', 60); $session = field('session', 120);
    $entreprise = oneLine(field('entreprise', 160)); $adresse = oneLine(field('adresse', 250)); $contact = oneLine(field('contact', 120));
    if ($formation === '' || !$slugOk($formation) || ($session !== '' && !isset($catalogue['sessions'][$session])) || $entreprise === '' || $adresse === '' || $contact === '' || $tel === '') {
        reply(422, false, 'Champs obligatoires manquants.');
    }
    $participants = [];
    $pp = $_POST['p-prenom'] ?? []; $pn = $_POST['p-nom'] ?? []; $pe = $_POST['p-email'] ?? [];
    if (!is_array($pp) || !is_array($pn) || count($pp) < 1 || count($pp) > 30) reply(422, false, 'Liste des participants invalide.');
    foreach ($pp as $i => $p) {
        $p = oneLine(mb_substr(trim((string)$p), 0, 80)); $n = oneLine(mb_substr(trim((string)($pn[$i] ?? '')), 0, 80));
        $e = oneLine(mb_substr(trim((string)($pe[$i] ?? '')), 0, 160));
        if ($p === '' || $n === '') reply(422, false, 'Nom et prénom requis pour chaque participant.');
        if ($e !== '' && !filter_var($e, FILTER_VALIDATE_EMAIL)) reply(422, false, 'E-mail de participant invalide.');
        $participants[] = "$p $n" . ($e ? " <$e>" : '');
    }
    $subject = 'Site web — Inscription ' . $fName($formation) . ' — ' . $entreprise;
    $lines = [
        'Formation' => $fName($formation), 'Session' => $session ? $catalogue['sessions'][$session] : 'Prochaine date disponible',
        'Langue' => oneLine(field('langue', 30)) ?: 'français',
        'Participants (' . count($participants) . ')' => implode("\n", $participants),
        'Entreprise' => $entreprise, 'TVA' => oneLine(field('tva', 30)) ?: '—', 'Adresse de facturation' => $adresse,
        'Contact' => $contact, 'E-mail' => $email, 'Téléphone' => $tel, 'Remarque' => field('message', 3000) ?: '—',
    ];
}

// Corps du message (texte brut, aucune donnée injectée dans les en-têtes hormis Reply-To validé)
$body = '';
foreach ($lines as $k => $v) { $body .= $k . " :\n" . $v . "\n\n"; }
$body .= "—\nEnvoyé depuis centrecfs.be le " . date('d/m/Y à H:i');

$subject = '=?UTF-8?B?' . base64_encode(oneLine($subject)) . '?=';
$headers = [
    'From' => $config['from'],
    'Reply-To' => $email,
    'MIME-Version' => '1.0',
    'Content-Type' => 'text/plain; charset=UTF-8',
    'Content-Transfer-Encoding' => '8bit',
    'X-Mailer' => 'CentreCFS-Site',
];

$sent = mail($config['to'], $subject, $body, $headers);
if (!$sent) {
    error_log('[cfs-form] échec mail()');
    reply(500, false, "L'envoi a échoué.");
}
reply(200, true);
