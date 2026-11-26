<?php
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(403); exit; }
// Copiez ce fichier en config.php et adaptez les valeurs. Ne publiez jamais config.php dans un dépôt public.
return [
    'to' => 'info@centrecfs.be',                       // destinataire des demandes
    'from' => 'Site Centre CFS <no-reply@centrecfs.be>', // adresse d'envoi (doit appartenir au domaine : SPF/DKIM)
    'allowed_origins' => ['https://centrecfs.be', 'https://www.centrecfs.be'],
    'salt' => 'remplacez-par-une-longue-chaine-aleatoire',
];
