/**
 * =========================================================================
 * CENTRE CFS — Sessions, places, réservations et demandes (Google Apps Script)
 * -------------------------------------------------------------------------
 * À coller dans la feuille Google PRIVÉE « Réservations – Centre CFS » :
 * Extensions › Apps Script › (tout remplacer) › Enregistrer, puis lancer la fonction `install`.
 * Guide pas à pas : docs/SETUP.md et docs/README-RESERVATIONS.md. Guide de l'équipe : docs/GUIDE-FEUILLE.md.
 *
 * Repris du système Wisy Safety (même logique, mêmes garanties), adapté au Centre CFS :
 *   - le navigateur ne parle JAMAIS à ce script : seul le Worker Cloudflare l'appelle, et chaque appel est signé
 *     (HMAC-SHA256, horodatage de moins de 5 minutes, signature à usage unique) ;
 *   - places recalculées à chaque demande à partir de l'onglet « Réservations » (jamais saisies à la main) ;
 *   - réservation vérifiée et écrite SOUS VERROU, tout ou rien, sans doublon (requestId), clôture 48 h avant ;
 *   - paiement en ligne (Mollie, via le Worker) : « En attente de paiement » 30 minutes, puis Confirmée ou Expirée ;
 *   - paiement sur facture (entreprises) : « En attente (facture) » 72 heures, confirmée par l'équipe (menu) ;
 *   - e-mails envoyés par EmailJS (API REST + clé privée), avec une file d'envoi, des réessais, un compteur mensuel
 *     partagé avec le Worker et des priorités (P1 essentiels, P2 demandes, P3 rappels).
 *
 * Règle d'or pour l'équipe : NE JAMAIS SUPPRIMER UNE LIGNE. Toujours passer par le menu « Centre CFS ».
 * Les secrets (HMAC, clé privée EmailJS) sont rangés dans les PROPRIÉTÉS DU SCRIPT, jamais dans une cellule.
 * =========================================================================
 */

var VERSION = "2.1.0";

var CONFIG = {
  FILE_NAME: "Réservations – Centre CFS",
  TIMEZONE: "Europe/Brussels",
  LOCALE: "fr_BE",
  TEAM_EMAIL: "info@centrecfs.be",          // destinataire fixe du modèle EmailJS « équipe »
  SITE_URL: "https://centrecfs.be",
  PHONE: "0475 34 02 89",
  PAY_ONLINE_MINUTES: 30,                   // « En attente de paiement » bloque les places 30 minutes
  INVOICE_HOURS: 72,                        // « En attente (facture) » bloque les places 72 heures
  CLOSE_HOURS_BEFORE: 48,                   // fin des inscriptions en ligne par défaut
  MAX_ITEMS: 10,
  MAX_SEATS_PER_ITEM: 50,
  PER_EMAIL_PER_HOUR: 5,
  GLOBAL_PER_HOUR: 60,
  GLOBAL_PER_6_HOURS: 200,
  CONTACT_PER_EMAIL_PER_HOUR: 5,
  CONTACT_GLOBAL_PER_HOUR: 40,
  CONTACT_GLOBAL_PER_6_HOURS: 150,
  CONTACT_MIN_FILL_MS: 2500,
  CACHE_SECONDS: 20,
  SIGNATURE_MAX_AGE_SECONDS: 300,
  EMAIL_QUOTA: 200,                         // plan gratuit EmailJS (propriété EMAILJS_MONTHLY_QUOTA pour changer)
  EMAIL_WARN_RATIO: 0.8,                    // à 80 % : rappels (P3) suspendus + alerte unique à l'équipe
  EMAIL_SPACING_MS: 1100,                   // EmailJS : 1 requête par seconde
  MAX_SEND_TRIES: 5,
  REMINDER_DAYS_BEFORE: 2,                  // rappel J-2
  BACKUP_KEEP: 8,                           // sauvegardes hebdomadaires gardées
  REQUEST_RETENTION_MONTHS: 0               // > 0 : demandes plus anciennes anonymisées (à reporter dans la politique de confidentialité)
};

var TAB = {
  FORMATIONS: "Formations", SESSIONS: "Sessions", BOOKINGS: "Réservations", PEOPLE: "Participants",
  REQUESTS: "Demandes", PAYMENTS: "Paiements", PROFILES: "Profils", OUTBOX: "File d'envoi", LOG: "Journal"
};

/* ===== Données d'installation (générées par site/tools/import_client.py depuis client/formations.csv et client/sessions.csv) ===== */
/* @seed:start */
/* Généré par site/tools/import_client.py — ne pas modifier à la main. */
/* [identifiant, nom, domaine, prix HTVA (null = sur devis), durée, capacité par défaut, réservable en ligne] */
var FORMATIONS = [
  ["vca-base", "VCA Base", "vca", 250.0, "1 jour (8 h)", null, true],
  ["vca-ligne-hierarchique", "VCA Cadre", "vca", 400.0, "2 jours", null, true],
  ["conseiller-prevention-base", "Conseiller en prévention – niveau base", "prevention", 1290.0, "6 jours (42 h)", null, true],
  ["recyclage-conseiller-prevention", "Recyclage conseiller en prévention", "prevention", 210.0, "8 h", null, true],
  ["secourisme-base", "Secourisme de base", "secours", 330.0, "", null, true],
  ["rappel-secourisme", "Rappel secourisme", "secours", 140.0, "½ jour", null, true],
  ["initiation-premiers-soins", "Initiation aux premiers soins", "secours", 60.0, "2 h", 15, true],
  ["dea-defibrillateur", "D.E.A. – défibrillateur", "secours", 75.0, "", null, true],
  ["equipier-premiere-intervention", "Équipier de première intervention", "incendie", 210.0, "1 jour (½ théorie, ½ pratique)", null, true],
  ["recyclage-equipier-premiere-intervention", "Recyclage équipier de première intervention", "incendie", 130.0, "", null, true],
  ["initiation-feu", "Initiation feu et extincteurs", "incendie", 85.0, "", null, true],
  ["ari-appareil-respiratoire", "A.R.I. – appareil respiratoire isolant", "incendie", 240.0, "", null, true],
  ["ba4", "BA4 – personnel averti", "electricite", 275.0, "1 jour", null, true],
  ["ba5", "BA5 – personnel qualifié", "electricite", 275.0, "1 jour", null, true],
  ["produits-dangereux", "Produits dangereux", "dangereux", 160.0, "", null, true],
  ["amiante", "Amiante", "dangereux", 220.0, "", null, true],
  ["ergonomie", "Ergonomie au poste de travail", "ergonomie", 130.0, "", null, true],
  ["harnais", "Harnais et travail en hauteur", "equipements", 210.0, "", null, true],
  ["nacelle", "Nacelle élévatrice (PEMP)", "equipements", 260.0, "", null, true],
  ["chariot-elevateur", "Chariot élévateur", "equipements", 240.0, "", null, true],
  ["echafaudage", "Échafaudage", "equipements", 240.0, "", null, true],
  ["pont-roulant", "Pont roulant", "equipements", 220.0, "", null, true]
];
/* Sessions de client/sessions.csv, ajoutées par « Installer » seulement si l'onglet Sessions est vide. */
var SEED_SESSIONS = [
  {"training": "vca-base", "date": "2026-12-10", "endDate": null, "start": "08:30", "end": "17:00", "location": "charleroi", "language": "fr", "capacity": null, "published": true},
  {"training": "vca-ligne-hierarchique", "date": "2026-11-26", "endDate": "2026-11-27", "start": "08:30", "end": "17:00", "location": "engis", "language": "fr", "capacity": null, "published": true},
  {"training": "vca-ligne-hierarchique", "date": "2026-12-10", "endDate": "2026-12-11", "start": "08:30", "end": "17:00", "location": "charleroi", "language": "fr", "capacity": null, "published": true},
  {"training": "vca-ligne-hierarchique", "date": "2026-12-14", "endDate": "2026-12-15", "start": "08:30", "end": "17:00", "location": "engis", "language": "fr", "capacity": null, "published": true},
  {"training": "ba4", "date": "2026-12-07", "endDate": null, "start": "08:30", "end": "16:30", "location": "engis", "language": "fr", "capacity": null, "published": true},
  {"training": "ba5", "date": "2026-12-07", "endDate": null, "start": "08:30", "end": "16:30", "location": "engis", "language": "fr", "capacity": null, "published": true}
];
/* @seed:end */

/* ===== Textes des e-mails en 3 langues (générés depuis site/content/ui.{fr,nl,en}.json par site/tools/sync_gas_i18n.py) ===== */
/* @i18n:start */
/* Généré par site/tools/sync_gas_i18n.py — ne pas modifier à la main. */
var I18N = {
  "fr": {
    "email.account_path": "/compte/",
    "email.agenda_path": "/agenda/",
    "email.auth_email_change_body": "Confirmez le changement d'adresse e-mail de votre compte en cliquant sur le bouton ci-dessous.",
    "email.auth_email_change_cta": "Confirmer le changement",
    "email.auth_email_change_subject": "Confirmez votre nouvelle adresse e-mail – Centre CFS",
    "email.auth_email_change_title": "Confirmez le changement d'adresse",
    "email.auth_expiry": "Ce lien est valable 1 heure.",
    "email.auth_ignore": "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
    "email.auth_invite_body": "Vous êtes invité à gérer les formations de votre entreprise sur le site du Centre CFS. Cliquez sur le bouton ci-dessous pour créer votre accès.",
    "email.auth_invite_cta": "Accepter l'invitation",
    "email.auth_invite_subject": "Invitation à l'espace client du Centre CFS",
    "email.auth_invite_title": "Vous êtes invité",
    "email.auth_magiclink_body": "Cliquez sur le bouton ci-dessous pour vous connecter à votre espace client.",
    "email.auth_magiclink_cta": "Me connecter",
    "email.auth_magiclink_subject": "Votre lien de connexion – Centre CFS",
    "email.auth_magiclink_title": "Votre lien de connexion",
    "email.auth_otp_body": "Saisissez ce code pour confirmer l'opération : {code}",
    "email.auth_otp_subject": "Votre code de vérification – Centre CFS",
    "email.auth_otp_title": "Votre code de vérification",
    "email.auth_recovery_body": "Vous avez demandé à changer de mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.",
    "email.auth_recovery_cta": "Choisir un nouveau mot de passe",
    "email.auth_recovery_subject": "Réinitialiser votre mot de passe – Centre CFS",
    "email.auth_recovery_title": "Réinitialiser votre mot de passe",
    "email.auth_signup_body": "Merci d'avoir créé votre compte. Cliquez sur le bouton ci-dessous pour confirmer votre adresse et l'activer.",
    "email.auth_signup_cta": "Confirmer mon adresse",
    "email.auth_signup_subject": "Confirmez votre adresse e-mail – Centre CFS",
    "email.auth_signup_title": "Confirmez votre adresse e-mail",
    "email.booking_cancelled_body": "Votre réservation {ref} ({training}, {when}) est annulée. Pour toute question, répondez à cet e-mail.",
    "email.booking_cancelled_subject": "Réservation annulée ({ref}) – Centre CFS",
    "email.booking_cancelled_title": "Réservation annulée",
    "email.cta_account": "Voir mon espace client",
    "email.cta_agenda": "Voir l'agenda",
    "email.days": "dimanche,lundi,mardi,mercredi,jeudi,vendredi,samedi",
    "email.footer": "E-mail automatique du Centre CFS. Pour toute question, répondez simplement à ce message.",
    "email.hello": "Bonjour {name},",
    "email.hello_anon": "Bonjour,",
    "email.invoice_body": "Vos places sont bloquées pendant 72 heures. Notre équipe vérifie votre demande, confirme la réservation par e-mail et envoie la facture à votre entreprise.",
    "email.invoice_confirmed_body": "Bonne nouvelle : votre réservation {ref} est confirmée. La facture est envoyée à votre entreprise.",
    "email.invoice_confirmed_subject": "Réservation confirmée {ref} – Centre CFS",
    "email.invoice_confirmed_title": "Votre réservation est confirmée",
    "email.invoice_subject": "Places bloquées {ref} – Centre CFS",
    "email.invoice_title": "Vos places sont bloquées",
    "email.l_date": "Date",
    "email.l_excl": "Total HTVA",
    "email.l_incl": "Total TVAC",
    "email.l_participants": "Participants",
    "email.l_payment": "Paiement",
    "email.l_place": "Lieu",
    "email.l_seats": "Places",
    "email.l_training": "Formation",
    "email.l_vat": "TVA",
    "email.months": "janvier,février,mars,avril,mai,juin,juillet,août,septembre,octobre,novembre,décembre",
    "email.paid_body": "Nous avons bien reçu votre paiement de {amount}. Vos places sont réservées.",
    "email.paid_subject": "Réservation confirmée et payée {ref} – Centre CFS",
    "email.paid_title": "Réservation confirmée et payée",
    "email.pay_invoice": "sur facture",
    "email.pay_online": "payé en ligne",
    "email.place_intra": "Dans votre entreprise (adresse convenue avec notre équipe)",
    "email.recycle_body": "Le certificat de {participant} pour la formation {training} est valable jusqu'au {date}. Pensez à planifier le recyclage.",
    "email.recycle_subject": "Certificat {training} : recyclage à prévoir",
    "email.recycle_title": "Un certificat arrive à échéance",
    "email.ref": "Référence : {ref}",
    "email.refund_note": "Si vous avez payé en ligne, vous êtes remboursé intégralement sur le moyen de paiement utilisé.",
    "email.reminder_body": "Votre formation commence bientôt. Voici les informations pratiques.",
    "email.reminder_contact": "Une question pratique ? Appelez-nous au {phone}.",
    "email.reminder_epi": "À apporter : chaussures de sécurité S3, vêtements de travail et carte d'identité.",
    "email.reminder_subject": "Rappel : {training} le {date}",
    "email.reminder_title": "Votre formation approche",
    "email.request_body": "Merci. Votre demande {ref} est enregistrée : notre équipe vous propose une date rapidement.",
    "email.request_subject": "Demande reçue {ref} – Centre CFS",
    "email.request_title": "Nous avons bien reçu votre demande",
    "email.schedule_body": "L'horaire de votre session {training} a changé. Votre réservation {ref} est conservée. Voici les nouvelles informations :",
    "email.schedule_reply": "Si ce nouvel horaire ne vous convient pas, répondez à cet e-mail.",
    "email.schedule_subject": "Changement d'horaire ({ref}) – Centre CFS",
    "email.schedule_title": "L'horaire de votre formation a changé",
    "email.session_cancelled_body": "Nous sommes désolés : la session {training} du {date} est annulée. Votre réservation {ref} est annulée.",
    "email.session_cancelled_next": "Notre équipe vous contacte pour vous proposer une autre date.",
    "email.session_cancelled_subject": "Session annulée ({ref}) – Centre CFS",
    "email.session_cancelled_title": "Session annulée",
    "email.tagline": "Formations sécurité au travail"
  },
  "nl": {
    "email.account_path": "/nl/account/",
    "email.agenda_path": "/nl/agenda/",
    "email.auth_email_change_body": "Bevestig de wijziging van het e-mailadres van uw account door op de knop hieronder te klikken.",
    "email.auth_email_change_cta": "Wijziging bevestigen",
    "email.auth_email_change_subject": "Bevestig uw nieuwe e-mailadres – Centre CFS",
    "email.auth_email_change_title": "Bevestig de adreswijziging",
    "email.auth_expiry": "Deze link is 1 uur geldig.",
    "email.auth_ignore": "Hebt u dit niet aangevraagd? Negeer dan dit bericht.",
    "email.auth_invite_body": "U bent uitgenodigd om de opleidingen van uw bedrijf te beheren op de site van Centre CFS. Klik op de knop hieronder om uw toegang aan te maken.",
    "email.auth_invite_cta": "Uitnodiging aanvaarden",
    "email.auth_invite_subject": "Uitnodiging voor de klantenzone van Centre CFS",
    "email.auth_invite_title": "U bent uitgenodigd",
    "email.auth_magiclink_body": "Klik op de knop hieronder om u aan te melden in uw klantenzone.",
    "email.auth_magiclink_cta": "Aanmelden",
    "email.auth_magiclink_subject": "Uw aanmeldlink – Centre CFS",
    "email.auth_magiclink_title": "Uw aanmeldlink",
    "email.auth_otp_body": "Vul deze code in om de handeling te bevestigen: {code}",
    "email.auth_otp_subject": "Uw verificatiecode – Centre CFS",
    "email.auth_otp_title": "Uw verificatiecode",
    "email.auth_recovery_body": "U hebt gevraagd uw wachtwoord te wijzigen. Klik op de knop hieronder om een nieuw wachtwoord te kiezen.",
    "email.auth_recovery_cta": "Een nieuw wachtwoord kiezen",
    "email.auth_recovery_subject": "Uw wachtwoord herstellen – Centre CFS",
    "email.auth_recovery_title": "Uw wachtwoord herstellen",
    "email.auth_signup_body": "Bedankt voor het aanmaken van uw account. Klik op de knop hieronder om uw adres te bevestigen en het account te activeren.",
    "email.auth_signup_cta": "Mijn adres bevestigen",
    "email.auth_signup_subject": "Bevestig uw e-mailadres – Centre CFS",
    "email.auth_signup_title": "Bevestig uw e-mailadres",
    "email.booking_cancelled_body": "Uw reservering {ref} ({training}, {when}) is geannuleerd. Hebt u vragen? Beantwoord dan deze e-mail.",
    "email.booking_cancelled_subject": "Reservering geannuleerd ({ref}) – Centre CFS",
    "email.booking_cancelled_title": "Reservering geannuleerd",
    "email.cta_account": "Mijn klantenzone bekijken",
    "email.cta_agenda": "Agenda bekijken",
    "email.days": "zondag,maandag,dinsdag,woensdag,donderdag,vrijdag,zaterdag",
    "email.footer": "Automatische e-mail van Centre CFS. Hebt u een vraag? Beantwoord dan gewoon dit bericht.",
    "email.hello": "Beste {name},",
    "email.hello_anon": "Goedendag,",
    "email.invoice_body": "Uw plaatsen worden 72 uur vastgehouden. Ons team controleert uw aanvraag, bevestigt de reservering per e-mail en stuurt de factuur naar uw bedrijf.",
    "email.invoice_confirmed_body": "Goed nieuws: uw reservering {ref} is bevestigd. De factuur wordt naar uw bedrijf gestuurd.",
    "email.invoice_confirmed_subject": "Reservering bevestigd {ref} – Centre CFS",
    "email.invoice_confirmed_title": "Uw reservering is bevestigd",
    "email.invoice_subject": "Plaatsen vastgehouden {ref} – Centre CFS",
    "email.invoice_title": "Uw plaatsen worden vastgehouden",
    "email.l_date": "Datum",
    "email.l_excl": "Totaal excl. btw",
    "email.l_incl": "Totaal incl. btw",
    "email.l_participants": "Deelnemers",
    "email.l_payment": "Betaling",
    "email.l_place": "Locatie",
    "email.l_seats": "Plaatsen",
    "email.l_training": "Opleiding",
    "email.l_vat": "Btw",
    "email.months": "januari,februari,maart,april,mei,juni,juli,augustus,september,oktober,november,december",
    "email.paid_body": "We hebben uw betaling van {amount} goed ontvangen. Uw plaatsen zijn gereserveerd.",
    "email.paid_subject": "Reservering bevestigd en betaald {ref} – Centre CFS",
    "email.paid_title": "Reservering bevestigd en betaald",
    "email.pay_invoice": "op factuur",
    "email.pay_online": "online betaald",
    "email.place_intra": "In uw bedrijf (adres afgesproken met ons team)",
    "email.recycle_body": "Het certificaat van {participant} voor de opleiding {training} is geldig tot {date}. Denk eraan de bijscholing te plannen.",
    "email.recycle_subject": "Certificaat {training}: bijscholing plannen",
    "email.recycle_title": "Een certificaat vervalt binnenkort",
    "email.ref": "Referentie: {ref}",
    "email.refund_note": "Als u online hebt betaald, wordt u volledig terugbetaald via het gebruikte betaalmiddel.",
    "email.reminder_body": "Uw opleiding begint binnenkort. Hier is de praktische informatie.",
    "email.reminder_contact": "Een praktische vraag? Bel ons op {phone}.",
    "email.reminder_epi": "Mee te brengen: veiligheidsschoenen S3, werkkledij en identiteitskaart.",
    "email.reminder_subject": "Herinnering: {training} op {date}",
    "email.reminder_title": "Uw opleiding komt eraan",
    "email.request_body": "Bedankt. Uw aanvraag {ref} is geregistreerd: ons team stelt u snel een datum voor.",
    "email.request_subject": "Aanvraag ontvangen {ref} – Centre CFS",
    "email.request_title": "We hebben uw aanvraag goed ontvangen",
    "email.schedule_body": "Het uurrooster van uw sessie {training} is gewijzigd. Uw reservering {ref} blijft behouden. Dit is de nieuwe informatie:",
    "email.schedule_reply": "Past dit nieuwe uurrooster u niet? Beantwoord dan deze e-mail.",
    "email.schedule_subject": "Gewijzigd uurrooster ({ref}) – Centre CFS",
    "email.schedule_title": "Het uurrooster van uw opleiding is gewijzigd",
    "email.session_cancelled_body": "Het spijt ons: de sessie {training} van {date} is geannuleerd. Uw reservering {ref} is geannuleerd.",
    "email.session_cancelled_next": "Ons team neemt contact met u op om een andere datum voor te stellen.",
    "email.session_cancelled_subject": "Sessie geannuleerd ({ref}) – Centre CFS",
    "email.session_cancelled_title": "Sessie geannuleerd",
    "email.tagline": "Opleidingen veiligheid op het werk"
  },
  "en": {
    "email.account_path": "/en/account/",
    "email.agenda_path": "/en/schedule/",
    "email.auth_email_change_body": "Confirm the change of your account's email address by clicking the button below.",
    "email.auth_email_change_cta": "Confirm the change",
    "email.auth_email_change_subject": "Confirm your new email address – Centre CFS",
    "email.auth_email_change_title": "Confirm the address change",
    "email.auth_expiry": "This link is valid for 1 hour.",
    "email.auth_ignore": "If you did not make this request, please ignore this message.",
    "email.auth_invite_body": "You are invited to manage your company's training on the Centre CFS website. Click the button below to set up your access.",
    "email.auth_invite_cta": "Accept the invitation",
    "email.auth_invite_subject": "Invitation to the Centre CFS customer area",
    "email.auth_invite_title": "You are invited",
    "email.auth_magiclink_body": "Click the button below to sign in to your account.",
    "email.auth_magiclink_cta": "Sign me in",
    "email.auth_magiclink_subject": "Your sign-in link – Centre CFS",
    "email.auth_magiclink_title": "Your sign-in link",
    "email.auth_otp_body": "Enter this code to confirm the action: {code}",
    "email.auth_otp_subject": "Your verification code – Centre CFS",
    "email.auth_otp_title": "Your verification code",
    "email.auth_recovery_body": "You asked to change your password. Click the button below to choose a new one.",
    "email.auth_recovery_cta": "Choose a new password",
    "email.auth_recovery_subject": "Reset your password – Centre CFS",
    "email.auth_recovery_title": "Reset your password",
    "email.auth_signup_body": "Thank you for creating your account. Click the button below to confirm your address and activate it.",
    "email.auth_signup_cta": "Confirm my address",
    "email.auth_signup_subject": "Confirm your email address – Centre CFS",
    "email.auth_signup_title": "Confirm your email address",
    "email.booking_cancelled_body": "Your booking {ref} ({training}, {when}) is cancelled. If you have any questions, reply to this email.",
    "email.booking_cancelled_subject": "Booking cancelled ({ref}) – Centre CFS",
    "email.booking_cancelled_title": "Booking cancelled",
    "email.cta_account": "Go to my account",
    "email.cta_agenda": "See the schedule",
    "email.days": "Sunday,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday",
    "email.footer": "Automatic email from Centre CFS. If you have any questions, simply reply to this message.",
    "email.hello": "Hello {name},",
    "email.hello_anon": "Hello,",
    "email.invoice_body": "Your places are held for 72 hours. Our team checks your request, confirms the booking by email and sends the invoice to your company.",
    "email.invoice_confirmed_body": "Good news: your booking {ref} is confirmed. The invoice is being sent to your company.",
    "email.invoice_confirmed_subject": "Booking confirmed {ref} – Centre CFS",
    "email.invoice_confirmed_title": "Your booking is confirmed",
    "email.invoice_subject": "Places held {ref} – Centre CFS",
    "email.invoice_title": "Your places are held",
    "email.l_date": "Date",
    "email.l_excl": "Total excl. VAT",
    "email.l_incl": "Total incl. VAT",
    "email.l_participants": "Participants",
    "email.l_payment": "Payment",
    "email.l_place": "Location",
    "email.l_seats": "Places",
    "email.l_training": "Course",
    "email.l_vat": "VAT",
    "email.months": "January,February,March,April,May,June,July,August,September,October,November,December",
    "email.paid_body": "We have received your payment of {amount}. Your places are booked.",
    "email.paid_subject": "Booking confirmed and paid {ref} – Centre CFS",
    "email.paid_title": "Booking confirmed and paid",
    "email.pay_invoice": "by invoice",
    "email.pay_online": "paid online",
    "email.place_intra": "At your premises (address agreed with our team)",
    "email.recycle_body": "The certificate of {participant} for the {training} course is valid until {date}. Remember to plan the refresher.",
    "email.recycle_subject": "{training} certificate: plan the refresher",
    "email.recycle_title": "A certificate is about to expire",
    "email.ref": "Reference: {ref}",
    "email.refund_note": "If you paid online, you will be refunded in full to the payment method you used.",
    "email.reminder_body": "Your course starts soon. Here is the practical information.",
    "email.reminder_contact": "A practical question? Call us on {phone}.",
    "email.reminder_epi": "Please bring: S3 safety shoes, work clothes and your identity card.",
    "email.reminder_subject": "Reminder: {training} on {date}",
    "email.reminder_title": "Your course is coming up",
    "email.request_body": "Thank you. Your request {ref} is recorded: our team will suggest a date shortly.",
    "email.request_subject": "Request received {ref} – Centre CFS",
    "email.request_title": "We have received your request",
    "email.schedule_body": "The schedule of your {training} session has changed. Your booking {ref} is kept. Here are the new details:",
    "email.schedule_reply": "If the new schedule does not suit you, reply to this email.",
    "email.schedule_subject": "Schedule change ({ref}) – Centre CFS",
    "email.schedule_title": "Your course schedule has changed",
    "email.session_cancelled_body": "We are sorry: the {training} session on {date} has been cancelled. Your booking {ref} is cancelled.",
    "email.session_cancelled_next": "Our team will contact you to suggest another date.",
    "email.session_cancelled_subject": "Session cancelled ({ref}) – Centre CFS",
    "email.session_cancelled_title": "Session cancelled",
    "email.tagline": "Workplace safety training"
  }
};
var TRAINING_NAMES = {
  "vca-base": {
    "fr": "VCA Base",
    "nl": "VCA Basis (B-VCA)",
    "en": "VCA Basic (B-VCA)"
  },
  "vca-ligne-hierarchique": {
    "fr": "VCA Cadre",
    "nl": "VOL-VCA",
    "en": "VOL-VCA (supervisors)"
  },
  "conseiller-prevention-base": {
    "fr": "Conseiller en prévention – niveau base",
    "nl": "Preventieadviseur – basiskennis",
    "en": "Prevention advisor – basic level"
  },
  "recyclage-conseiller-prevention": {
    "fr": "Recyclage conseiller en prévention",
    "nl": "Bijscholing preventieadviseur",
    "en": "Prevention advisor refresher"
  },
  "secourisme-base": {
    "fr": "Secourisme de base",
    "nl": "Hulpverlener op het werk",
    "en": "Workplace first aid"
  },
  "rappel-secourisme": {
    "fr": "Rappel secourisme",
    "nl": "Bijscholing hulpverlener",
    "en": "First-aid refresher"
  },
  "initiation-premiers-soins": {
    "fr": "Initiation aux premiers soins",
    "nl": "Initiatie eerste hulp",
    "en": "First-aid awareness"
  },
  "dea-defibrillateur": {
    "fr": "D.E.A. – défibrillateur",
    "nl": "AED – defibrillator",
    "en": "AED – defibrillator"
  },
  "equipier-premiere-intervention": {
    "fr": "Équipier de première intervention",
    "nl": "Eerste interventieploeg",
    "en": "First-response fire team"
  },
  "recyclage-equipier-premiere-intervention": {
    "fr": "Recyclage équipier de première intervention",
    "nl": "Bijscholing eerste interventieploeg",
    "en": "Fire team refresher"
  },
  "initiation-feu": {
    "fr": "Initiation feu et extincteurs",
    "nl": "Initiatie brand en blustoestellen",
    "en": "Fire and extinguisher training"
  },
  "ari-appareil-respiratoire": {
    "fr": "A.R.I. – appareil respiratoire isolant",
    "nl": "ARI – onafhankelijk ademhalingstoestel",
    "en": "SCBA – breathing apparatus"
  },
  "ba4": {
    "fr": "BA4 – personnel averti",
    "nl": "BA4 – gewaarschuwd persoon",
    "en": "BA4 – instructed person"
  },
  "ba5": {
    "fr": "BA5 – personnel qualifié",
    "nl": "BA5 – vakbekwaam persoon",
    "en": "BA5 – skilled person"
  },
  "produits-dangereux": {
    "fr": "Produits dangereux",
    "nl": "Gevaarlijke stoffen",
    "en": "Hazardous substances"
  },
  "amiante": {
    "fr": "Amiante",
    "nl": "Asbest",
    "en": "Asbestos"
  },
  "ergonomie": {
    "fr": "Ergonomie au poste de travail",
    "nl": "Ergonomie op de werkpost",
    "en": "Workstation ergonomics"
  },
  "harnais": {
    "fr": "Harnais et travail en hauteur",
    "nl": "Harnas en werken op hoogte",
    "en": "Harness and working at height"
  },
  "nacelle": {
    "fr": "Nacelle élévatrice (PEMP)",
    "nl": "Hoogwerker",
    "en": "Aerial work platform (MEWP)"
  },
  "chariot-elevateur": {
    "fr": "Chariot élévateur",
    "nl": "Heftruck",
    "en": "Forklift"
  },
  "echafaudage": {
    "fr": "Échafaudage",
    "nl": "Steigerbouw",
    "en": "Scaffolding"
  },
  "pont-roulant": {
    "fr": "Pont roulant",
    "nl": "Rolbrug",
    "en": "Overhead crane"
  }
};
/* @i18n:end */

/* Statuts */
var S_OPEN = "Ouverte", S_CLOSED = "Fermée", S_CANCELLED = "Annulée";
var SESSION_STATUSES = [S_OPEN, S_CLOSED, S_CANCELLED];
var B_CONFIRMED = "Confirmée", B_PENDING_PAY = "En attente de paiement", B_PENDING_INV = "En attente (facture)";
var B_REQUEST = "Demande (date à convenir)", B_CANCELLED = "Annulée", B_EXPIRED = "Expirée";
var BOOKING_STATUSES = [B_CONFIRMED, B_PENDING_PAY, B_PENDING_INV, B_REQUEST, B_CANCELLED, B_EXPIRED];
var M_ONLINE = "En ligne", M_INVOICE = "Facture";
var P_WAIT = "En attente", P_PAID = "Payé", P_FAILED = "Échoué", P_EXPIRED = "Expiré", P_CANCELED = "Abandonné";
var P_INVOICE = "Facture à émettre", P_REFUND = "Remboursement à faire", P_REFUNDED = "Remboursé";
var PAY_STATUSES = [P_WAIT, P_PAID, P_FAILED, P_EXPIRED, P_CANCELED, P_INVOICE, P_REFUND, P_REFUNDED];
var Q_TODO = "À envoyer", Q_SENT = "Envoyé", Q_FAILED = "Échec", Q_QUOTA = "Quota atteint", Q_PAUSED = "Suspendu (quota)";
var R_NEW = "Nouvelle", R_DOING = "En cours", R_DONE = "Traitée", R_SPAM = "Indésirable", R_ERASED = "Effacée";
var REQUEST_STATUSES = [R_NEW, R_DOING, R_DONE, R_SPAM, R_ERASED];

var LOCATIONS = [["engis", "Engis"], ["charleroi", "Charleroi"], ["intra", "En entreprise"]];
var LANGUAGES = [["fr", "Français"], ["nl", "Néerlandais"], ["en", "Anglais"], ["de", "Allemand"], ["it", "Italien"],
  ["es", "Espagnol"], ["pt", "Portugais"], ["ro", "Roumain"], ["ru", "Russe"], ["tr", "Turc"], ["bg", "Bulgare"]];
var SITE_LANGS = ["fr", "nl", "en"];

/* Colonnes : [champ, en-tête, note, largeur, technique (masquée)] */
var COLS = {};
COLS[TAB.FORMATIONS] = [
  ["id", "Identifiant", "Identifiant de la formation sur le site. Ne pas modifier.", 190, false],
  ["name", "Formation", "Nom affiché (français). Les traductions viennent du site.", 290, false],
  ["domain", "Domaine", "", 160, false],
  ["price", "Prix HTVA (€)", "SOURCE UNIQUE des montants facturés. Vide = « Sur devis » (pas de paiement en ligne).", 110, false],
  ["duration", "Durée", "Information.", 140, false],
  ["capacity", "Capacité par défaut", "Proposée pour une nouvelle session.", 100, false],
  ["bookable", "Réservable en ligne", "Décochée = le site refuse les réservations pour cette formation.", 110, false],
  ["page", "Page du site", "", 300, false]
];
COLS[TAB.SESSIONS] = [
  ["id", "Identifiant", "Rempli automatiquement (date + formation + lieu). Ne pas modifier : les réservations y sont rattachées.", 230, false],
  ["training", "Formation", "Choisissez dans la liste.", 250, false],
  ["date", "Date de début", "JJ/MM/AAAA.", 105, false],
  ["end_date", "Date de fin", "Facultatif : sessions de plusieurs jours (ex. VCA Cadre).", 105, false],
  ["start", "Début", "HH:MM (ex. 08:30).", 70, false],
  ["end", "Fin", "HH:MM (ex. 17:00).", 70, false],
  ["location", "Lieu", "Engis, Charleroi ou En entreprise.", 120, false],
  ["language", "Langue", "Langue de la formation.", 110, false],
  ["capacity", "Places (total)", "Nombre maximal de participants.", 90, false],
  ["booked", "Réservées", "CALCULÉ à partir de l'onglet « Réservations ». Ne pas modifier.", 90, false],
  ["remaining", "Restantes", "CALCULÉ. 0 = complète.", 90, false],
  ["status", "Statut", "Ouverte = réservable · Fermée = visible mais plus réservable · Annulée = retirée du site.", 105, false],
  ["closes", "Fin des inscriptions", "Facultatif (JJ/MM/AAAA HH:MM). Vide = 48 h avant le début.", 150, false],
  ["published", "Publiée sur le site", "Cochée = visible sur le site.", 95, false],
  ["reminded", "Rappel J-2 (technique)", "", 120, true]
];
COLS[TAB.BOOKINGS] = [
  ["received", "Reçue le", "Rempli automatiquement.", 135, false],
  ["ref", "Référence", "Donnée au client (CFS-AAAA-XXXXX). Une demande peut avoir plusieurs lignes (une par session).", 135, false],
  ["session", "Session", "Identifiant de la session. Vide = date à convenir.", 230, false],
  ["training", "Formation", "", 210, false],
  ["when", "Date de la session", "", 165, false],
  ["seats", "Places", "Places prises par cette ligne.", 70, false],
  ["status", "Statut", "Confirmée, En attente de paiement et En attente (facture) non expirées comptent dans les places. Pour annuler : menu Centre CFS (jamais supprimer la ligne).", 175, false],
  ["expires", "Expire le", "Sans paiement ni confirmation, les places sont libérées à cette date.", 135, false],
  ["pay_mode", "Mode de paiement", "En ligne ou Facture.", 105, false],
  ["pay_status", "Statut du paiement", "", 150, false],
  ["amount_excl", "Montant HTVA (€)", "", 100, false],
  ["amount_incl", "Montant TVAC (€)", "", 100, false],
  ["company", "Société", "", 180, false],
  ["vat", "N° de TVA", "", 130, false],
  ["address", "Adresse de facturation", "", 260, false],
  ["contact", "Contact", "", 170, false],
  ["email", "E-mail", "", 210, false],
  ["phone", "Téléphone", "", 130, false],
  ["lang", "Langue", "Langue des e-mails envoyés au client.", 70, false],
  ["participants", "Participants", "Noms transmis (détail : onglet « Participants »).", 260, false],
  ["notes", "Remarque", "Remarque du client, puis notes de l'équipe.", 220, false],
  ["cancelled", "Annulée le", "", 135, false],
  ["request", "Clé de requête (technique)", "", 120, true],
  ["mollie_id", "Identifiant Mollie (technique)", "", 140, true],
  ["user_id", "Identifiant du compte (technique)", "", 140, true]
];
COLS[TAB.PEOPLE] = [
  ["ref", "Référence", "", 135, false], ["session", "Session", "", 230, false], ["training", "Formation", "", 210, false],
  ["first", "Prénom", "", 140, false], ["last", "Nom", "", 160, false], ["email", "E-mail", "Facultatif.", 220, false],
  ["presence", "Présence", "Présent / Absent.", 90, false], ["result", "Résultat", "Réussi / Échoué / —.", 90, false],
  ["valid_until", "Validité du certificat", "JJ/MM/AAAA.", 120, false]
];
COLS[TAB.REQUESTS] = [
  ["received", "Reçue le", "", 135, false],
  ["ref", "Référence", "Donnée au visiteur (CFD-AAAA-XXXXX).", 135, false],
  ["form", "Formulaire", "Contact, Devis, Inscription, Location de salle, Être prévenu.", 130, false],
  ["subject", "Sujet", "", 200, false],
  ["training", "Formation", "", 200, false],
  ["session", "Session souhaitée", "", 200, false],
  ["name", "Nom", "", 170, false],
  ["email", "E-mail", "Répondre directement : l'e-mail reçu a cette adresse en « Répondre à ».", 210, false],
  ["phone", "Téléphone", "", 130, false],
  ["company", "Société", "", 170, false],
  ["message", "Message", "", 380, false],
  ["details", "Détails", "", 260, false],
  ["page", "Page", "", 190, false],
  ["lang", "Langue", "", 70, false],
  ["status", "Statut", "Nouvelle · En cours · Traitée · Indésirable · Effacée (anonymisée).", 110, false],
  ["notes", "Notes", "Libre.", 220, false],
  ["mailed", "E-mail à l'équipe", "", 130, false],
  ["request", "Clé de requête (technique)", "", 120, true]
];
COLS[TAB.PAYMENTS] = [
  ["when", "Date", "", 135, false], ["ref", "Référence", "", 135, false], ["mollie_id", "Identifiant Mollie", "", 160, false],
  ["amount", "Montant (€)", "", 100, false], ["method", "Méthode", "", 120, false], ["status", "Statut", "", 140, false],
  ["note", "Note", "", 300, false]
];
COLS[TAB.PROFILES] = [
  ["user_id", "Identifiant du compte", "Copie en lecture seule des comptes du site (synchronisée toutes les 10 minutes).", 260, false],
  ["name", "Nom", "", 180, false], ["company", "Société", "", 180, false], ["email", "E-mail", "", 220, false],
  ["lang", "Langue", "", 70, false], ["created", "Créé le", "", 135, false], ["synced", "Synchronisé le", "", 135, false]
];
COLS[TAB.OUTBOX] = [
  ["created", "Créé le", "", 135, false], ["kind", "Type", "", 170, false], ["priority", "Priorité", "P1 essentiel · P2 demande · P3 rappel.", 70, false],
  ["template", "Modèle", "client ou equipe.", 70, false], ["to", "Destinataire", "", 220, false], ["bcc", "Copie cachée", "", 160, false],
  ["subject", "Objet", "", 320, false], ["status", "Statut", "", 120, false], ["tries", "Essais", "", 60, false],
  ["next", "Prochain essai", "", 135, false], ["error", "Dernière erreur", "", 300, false], ["ref", "Référence", "", 135, false],
  ["lang", "Langue", "", 60, false], ["reply", "Répondre à", "", 200, false],
  ["html", "Contenu HTML (technique)", "", 120, true], ["text", "Contenu texte (technique)", "", 120, true]
];
COLS[TAB.LOG] = [
  ["when", "Date", "", 135, false], ["kind", "Type", "", 110, false], ["target", "Session / référence", "", 190, false],
  ["level", "Niveau", "", 90, false], ["message", "Message", "", 560, false]
];

/* ======================================================================= utilitaires */

function now_() { return new Date(); }

function normalizeHeader_(h) {
  return String(h == null ? "" : h).replace(/\([^)]*\)/g, " ").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
/** Comme normalizeHeader_, mais garde le texte entre parenthèses (statuts « En attente (facture) »). */
function norm_(v) {
  return String(v == null ? "" : v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function clean_(v, max) {
  var s = String(v == null ? "" : v).replace(/[\u0000-\u001F\u007F​-‍﻿]/g, " ").replace(/\s+/g, " ").trim();
  return max ? s.slice(0, max) : s;
}
function cleanText_(v, max) {
  var s = String(v == null ? "" : v).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F​-‍﻿]/g, " ")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return max ? s.slice(0, max) : s;
}
/** Texte saisi par un visiteur : l'apostrophe initiale empêche Google Sheets d'y voir une formule. */
function asText_(s) { return s === "" || s == null ? "" : "'" + s; }
function isDate_(v) { return Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime()); }
function pad_(n) { return (n < 10 ? "0" : "") + n; }
function fmt_(d, pattern) { return Utilities.formatDate(d, CONFIG.TIMEZONE, pattern); }

function cellDate_(v) {
  if (v === "" || v == null) return "";
  if (isDate_(v)) return fmt_(v, "yyyy-MM-dd");
  var s = String(v).trim().replace(/^'/, ""), p, y, m, d;
  if ((p = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = +p[1]; m = +p[2]; d = +p[3]; }
  else if ((p = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/))) { d = +p[1]; m = +p[2]; y = +p[3]; }
  else return null;
  var dt = new Date(Date.UTC(y, m - 1, d));
  if (y < 2000 || y > 2200 || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return y + "-" + pad_(m) + "-" + pad_(d);
}
function cellTime_(v) {
  if (v === "" || v == null) return "";
  if (isDate_(v)) return fmt_(v, "HH:mm");
  var p = String(v).trim().replace(/^'/, "").toLowerCase().match(/^(\d{1,2})(?:\s*[:h.]\s*(\d{2})?)?$/);
  if (!p) return null;
  var h = +p[1], m = p[2] ? +p[2] : 0;
  return h <= 23 && m <= 59 ? pad_(h) + ":" + pad_(m) : null;
}
function cellDateTime_(v) {
  if (v === "" || v == null) return null;
  if (isDate_(v)) return v;
  var p = String(v).trim().replace(/^'/, "").match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})(?:\s+(\d{1,2})[:h](\d{2}))?$/);
  if (!p) return false;
  var day = cellDate_(p[1] + "/" + p[2] + "/" + p[3]);
  if (!day) return false;
  return at_(day, p[4] ? pad_(+p[4]) + ":" + p[5] : "00:00");
}
function at_(day, time) { return Utilities.parseDate(day + " " + (time || "00:00"), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm"); }
function addDays_(day, n) {
  var p = day.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return d.getUTCFullYear() + "-" + pad_(d.getUTCMonth() + 1) + "-" + pad_(d.getUTCDate());
}
function frDate_(day) { var p = day.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
function boolCell_(v) { return v === true || ["oui", "o", "x", "true", "vrai", "yes", "1"].indexOf(normalizeHeader_(v)) >= 0; }
function int_(v) {
  if (v === "" || v == null) return null;
  var n = Number(String(v).replace(",", ".").trim());
  return isFinite(n) && Math.floor(n) === n ? n : NaN;
}
function money_(v) {
  if (v === "" || v == null) return null;
  var n = Number(String(v).replace(/[€\s]/g, "").replace(",", "."));
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
function hex_(bytes) {
  return bytes.map(function (b) { var h = (b < 0 ? b + 256 : b).toString(16); return h.length === 1 ? "0" + h : h; }).join("");
}
function esc_(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function codeOf_(list, v) {
  var s = normalizeHeader_(v);
  if (!s) return null;
  for (var i = 0; i < list.length; i++) if (s === list[i][0] || s === normalizeHeader_(list[i][1])) return list[i][0];
  return undefined;
}
function labelOf_(list, code) { for (var i = 0; i < list.length; i++) if (list[i][0] === code) return list[i][1]; return ""; }
function lang_(v) { return SITE_LANGS.indexOf(String(v)) >= 0 ? String(v) : "fr"; }
function prop_(k) { try { return PropertiesService.getScriptProperties().getProperty(k); } catch (e) { return null; } }
/** Secret de signature partagé avec le Worker (nom de la mission : HMAC_SECRET ; ancien nom accepté). */
function hmacSecret_() { return prop_("RESERVATIONS_HMAC_SECRET") || prop_("HMAC_SECRET"); }

/* ======================================================================= signature (seul le Worker peut appeler) */

/** Compare deux chaînes en temps constant. */
function safeEqual_(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length || !a.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function hmacHex_(message, secret) { return hex_(Utilities.computeHmacSha256Signature(message, secret)); }

/**
 * Vérifie un message signé par le Worker : signature = HMAC-SHA256(secret, horodatage + "." + nonce + "." + contenu).
 * Apps Script ne donne pas accès aux en-têtes HTTP : horodatage, nonce et signature voyagent donc dans le corps (POST)
 * ou dans l'adresse (GET). Refusé : secret absent, horodatage à plus de 5 minutes, signature fausse, nonce déjà vu.
 */
function verifySigned_(ts, nonce, sig, content) {
  var secret = hmacSecret_();
  if (!secret || secret.length < 32) return "not_configured";
  var t = Number(ts);
  if (!isFinite(t) || Math.abs(now_().getTime() / 1000 - t) > CONFIG.SIGNATURE_MAX_AGE_SECONDS) return "expired";
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(nonce || "")) || !/^[a-f0-9]{64}$/.test(String(sig || ""))) return "bad_signature";
  if (!safeEqual_(hmacHex_(String(t) + "." + nonce + "." + content, secret), sig)) return "bad_signature";
  var cache = CacheService.getScriptCache(), key = "nonce:" + nonce;
  if (cache.get(key)) return "replayed";
  try { cache.put(key, "1", CONFIG.SIGNATURE_MAX_AGE_SECONDS + 60); } catch (e) { /* cache indisponible */ }
  return "";
}

/* ======================================================================= lecture des onglets */

function table_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) return null;
  var values = sheet.getDataRange().getValues();
  var header = values[0] || [], col = {}, byHeader = {};
  COLS[name].forEach(function (c) { byHeader[normalizeHeader_(c[1])] = c[0]; });
  header.forEach(function (h, i) { var f = byHeader[normalizeHeader_(h)]; if (f && col[f] === undefined) col[f] = i; });
  return { name: name, sheet: sheet, values: values, col: col, width: Math.max(header.length, 1) };
}
function get_(t, row, f) { return t.col[f] === undefined ? "" : row[t.col[f]]; }
function emptyRow_(row) { return !row.some(function (v) { return v !== false && String(v).trim() !== ""; }); }
function rowFor_(t, data) {
  var row = [];
  for (var c = 0; c < t.width; c++) row.push("");
  Object.keys(data).forEach(function (f) { if (t.col[f] !== undefined) row[t.col[f]] = data[f]; });
  return row;
}
function appendRows_(t, rows) {
  if (!rows.length) return;
  var first = t.sheet.getLastRow() + 1;
  var missing = first + rows.length - 1 - t.sheet.getMaxRows();
  if (missing > 0) t.sheet.insertRowsAfter(t.sheet.getMaxRows(), missing + 200);
  t.sheet.getRange(first, 1, rows.length, t.width).setValues(rows);
  rows.forEach(function (r) { t.values.push(r); });
}
function setCell_(t, line, f, value) {
  if (t.col[f] === undefined) return;
  t.sheet.getRange(line, t.col[f] + 1).setValue(value);
  if (t.values[line - 1]) t.values[line - 1][t.col[f]] = value;
}

/** Formations : { list, byId, find(texte) } — `find` accepte l'identifiant ou le nom. */
function readFormations_() {
  var t = table_(TAB.FORMATIONS), list = [];
  if (t) {
    for (var r = 1; r < t.values.length; r++) {
      var row = t.values[r];
      if (emptyRow_(row)) continue;
      var id = clean_(get_(t, row, "id"), 64).toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(id)) continue;
      var cap = int_(get_(t, row, "capacity"));
      list.push({
        id: id, name: clean_(get_(t, row, "name"), 160) || id, domain: clean_(get_(t, row, "domain"), 40),
        price: money_(get_(t, row, "price")), capacity: cap > 0 ? cap : null,
        bookable: t.col.bookable === undefined || get_(t, row, "bookable") === "" || boolCell_(get_(t, row, "bookable"))
      });
    }
  }
  if (!list.length) list = FORMATIONS.map(function (f) { return { id: f[0], name: f[1], domain: f[2], price: f[3] || null, capacity: f[5] || null, bookable: f[6] !== false }; });
  var byId = {}, byName = {};
  list.forEach(function (f) { byId[f.id] = f; byName[normalizeHeader_(f.name)] = f; });
  return { list: list, byId: byId, find: function (v) { var s = clean_(v); return byId[s.toLowerCase()] || byName[normalizeHeader_(s)] || null; } };
}

/** Sessions, avec leurs problèmes éventuels (une session invalide n'est jamais publiée). */
function readSessions_(formations) {
  var t = table_(TAB.SESSIONS), list = [], byId = {};
  if (!t) return { t: null, list: list, byId: byId };
  for (var r = 1; r < t.values.length; r++) {
    var row = t.values[r];
    if (emptyRow_(row)) continue;
    var f = formations.find(get_(t, row, "training"));
    var s = {
      line: r + 1,
      id: clean_(get_(t, row, "id"), 80),
      training: f ? f.id : null,
      trainingName: f ? f.name : clean_(get_(t, row, "training"), 160),
      domain: f ? f.domain : "",
      price: f ? f.price : null,
      date: cellDate_(get_(t, row, "date")),
      endDate: cellDate_(get_(t, row, "end_date")),
      start: cellTime_(get_(t, row, "start")),
      end: cellTime_(get_(t, row, "end")),
      location: codeOf_(LOCATIONS, get_(t, row, "location")),
      language: codeOf_(LANGUAGES, get_(t, row, "language")),
      capacity: int_(get_(t, row, "capacity")),
      statusRaw: clean_(get_(t, row, "status")),
      closes: cellDateTime_(get_(t, row, "closes")),
      published: boolCell_(get_(t, row, "published")),
      reminded: clean_(get_(t, row, "reminded"), 40),
      problems: []
    };
    var st = normalizeHeader_(s.statusRaw);
    s.status = !st || st === "ouverte" || st === "open" ? "open" : st === "fermee" || st === "closed" ? "closed"
      : st === "annulee" || st === "cancelled" ? "cancelled" : null;
    if (!s.id) s.problems.push("identifiant manquant");
    else if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(s.id)) s.problems.push("identifiant invalide (minuscules, chiffres, tirets)");
    else if (byId[s.id]) s.problems.push("identifiant déjà utilisé ligne " + byId[s.id].line);
    if (!f) s.problems.push("formation inconnue (choisissez-la dans la liste)");
    if (!s.date) s.problems.push(s.date === null ? "date de début illisible (JJ/MM/AAAA)" : "date de début manquante");
    if (s.endDate === null) s.problems.push("date de fin illisible (JJ/MM/AAAA)");
    if (s.date && s.endDate && s.endDate < s.date) s.problems.push("la date de fin est avant la date de début");
    if (s.date && s.endDate && s.endDate > addDays_(s.date, 31)) s.problems.push("session de plus de 31 jours");
    if (s.endDate === s.date) s.endDate = "";
    if (s.start === null) s.problems.push("heure de début illisible (HH:MM)");
    if (s.end === null) s.problems.push("heure de fin illisible (HH:MM)");
    if (s.start && s.end && s.end <= s.start) s.problems.push("l'heure de fin doit être après l'heure de début");
    if (s.end && !s.start) s.problems.push("heure de fin sans heure de début");
    if (!s.location) s.problems.push(s.location === undefined ? "lieu inconnu (Engis, Charleroi ou En entreprise)" : "lieu manquant");
    if (s.language === undefined) s.problems.push("langue inconnue");
    if (s.capacity === null || isNaN(s.capacity) || s.capacity < 1 || s.capacity > 500) s.problems.push("places (total) : nombre entier de 1 à 500");
    if (s.status === null) s.problems.push("statut incompris (Ouverte, Fermée ou Annulée)");
    if (s.closes === false) s.problems.push("fin des inscriptions illisible (JJ/MM/AAAA HH:MM)");
    s.valid = !s.problems.length;
    list.push(s);
    if (s.id && !byId[s.id]) byId[s.id] = s;
  }
  return { t: t, list: list, byId: byId };
}

function startOf_(s) { return at_(s.date, s.start || "00:00"); }
function lastDay_(s) { return s.endDate || s.date; }
function endOf_(s) { return s.end ? at_(lastDay_(s), s.end) : at_(addDays_(lastDay_(s), 1), "00:00"); }
function closesOf_(s) { return s.closes ? s.closes : new Date(startOf_(s).getTime() - CONFIG.CLOSE_HOURS_BEFORE * 3600000); }
function whenText_(s) {
  return frDate_(s.date) + (s.endDate ? " → " + frDate_(s.endDate) : "") + (s.start ? " · " + s.start + (s.end ? "–" + s.end : "") : "");
}

/** Statut d'une ligne de réservation → confirmed | pending_pay | pending_invoice | request | cancelled | expired | null. */
function bookingStatus_(v) {
  var s = norm_(v);
  if (s === "confirmee" || s === "confirmed") return "confirmed";
  if (s === "en_attente_de_paiement" || s === "pending_payment") return "pending_pay";
  if (s === "en_attente_facture" || s === "pending_invoice") return "pending_invoice";
  if (s.indexOf("demande") === 0 || s === "request") return "request";
  if (s === "annulee" || s === "cancelled") return "cancelled";
  if (s === "expiree" || s === "expired") return "expired";
  return null;
}

function readBookings_() {
  var t = table_(TAB.BOOKINGS), rows = [];
  if (!t) return { t: null, rows: rows };
  for (var r = 1; r < t.values.length; r++) {
    var row = t.values[r];
    if (emptyRow_(row)) continue;
    var exp = get_(t, row, "expires");
    rows.push({
      line: r + 1,
      received: get_(t, row, "received"),
      ref: clean_(get_(t, row, "ref"), 40),
      session: clean_(get_(t, row, "session"), 80),
      training: clean_(get_(t, row, "training"), 160),
      when: clean_(get_(t, row, "when"), 80),
      seats: int_(get_(t, row, "seats")),
      statusRaw: clean_(get_(t, row, "status")),
      status: bookingStatus_(get_(t, row, "status")),
      expires: isDate_(exp) ? exp : cellDateTime_(exp) || null,
      payMode: clean_(get_(t, row, "pay_mode"), 40),
      payStatus: clean_(get_(t, row, "pay_status"), 40),
      amountExcl: money_(get_(t, row, "amount_excl")),
      amountIncl: money_(get_(t, row, "amount_incl")),
      company: clean_(get_(t, row, "company"), 160),
      vat: clean_(get_(t, row, "vat"), 40),
      contact: clean_(get_(t, row, "contact"), 160),
      email: clean_(get_(t, row, "email"), 160),
      phone: clean_(get_(t, row, "phone"), 60),
      lang: lang_(clean_(get_(t, row, "lang"), 5)),
      participants: clean_(get_(t, row, "participants"), 2000),
      request: clean_(get_(t, row, "request"), 80),
      mollieId: clean_(get_(t, row, "mollie_id"), 60),
      userId: clean_(get_(t, row, "user_id"), 60)
    });
  }
  return { t: t, rows: rows };
}

/** Une ligne de réservation occupe-t-elle des places ? */
function holdsSeats_(b, now) {
  if (b.status === "confirmed") return true;
  return (b.status === "pending_pay" || b.status === "pending_invoice") && (!b.expires || b.expires.getTime() > now.getTime());
}
function taken_(bookings, now) {
  var out = {};
  bookings.forEach(function (b) {
    if (!b.session || !holdsSeats_(b, now)) return;
    out[b.session] = (out[b.session] || 0) + (b.seats > 0 ? b.seats : 0);
  });
  return out;
}
/** open | full | closed | cancelled — ce que le site affiche. */
function publicStatus_(s, remaining, now) {
  if (s.status === "cancelled") return "cancelled";
  if (s.status === "closed" || now.getTime() >= closesOf_(s).getTime()) return "closed";
  if (remaining <= 0) return "full";
  return "open";
}
function refreshCounts_(sessions, taken) {
  var t = sessions.t;
  if (!t || t.values.length < 2) return;
  var n = t.values.length - 1, byLine = {};
  sessions.list.forEach(function (s) { byLine[s.line] = s; });
  ["booked", "remaining"].forEach(function (f) {
    if (t.col[f] === undefined) return;
    var out = [];
    for (var r = 1; r <= n; r++) {
      var s = byLine[r + 1];
      if (!s || !s.id) { out.push([""]); continue; }
      var booked = taken[s.id] || 0, cap = s.capacity > 0 ? s.capacity : 0;
      out.push([f === "booked" ? booked : Math.max(0, cap - booked)]);
    }
    t.sheet.getRange(2, t.col[f] + 1, n, 1).setValues(out);
  });
}
function refreshAll_() {
  var formations = readFormations_(), sessions = readSessions_(formations), bookings = readBookings_();
  refreshCounts_(sessions, taken_(bookings.rows, now_()));
}

/* ======================================================================= liste publique (GET signé) */

/** Ce que le site reçoit : sessions PUBLIÉES, valides, à venir. Jamais une réservation ni une donnée personnelle. */
function publicSessions_() {
  var now = now_(), formations = readFormations_(), sessions = readSessions_(formations), bookings = readBookings_();
  var taken = taken_(bookings.rows, now);
  var out = sessions.list.filter(function (s) {
    return s.valid && s.published && s.status !== "cancelled" && endOf_(s).getTime() > now.getTime();
  }).map(function (s) {
    var remaining = Math.max(0, s.capacity - (taken[s.id] || 0));
    return {
      id: s.id, training: s.training, date: s.date, endDate: s.endDate || null,
      startTime: s.start || null, endTime: s.end || null, location: s.location, language: s.language || "fr",
      capacity: s.capacity, seatsLeft: remaining, status: publicStatus_(s, remaining, now),
      closesAt: fmt_(closesOf_(s), "yyyy-MM-dd'T'HH:mm"), price: s.price
    };
  }).sort(function (a, b) {
    var ka = a.date + (a.startTime || ""), kb = b.date + (b.startTime || "");
    return ka < kb ? -1 : ka > kb ? 1 : (a.id < b.id ? -1 : 1);
  });
  return { status: "ok", version: VERSION, generatedAt: fmt_(now, "yyyy-MM-dd'T'HH:mm"), sessions: out.slice(0, 300) };
}

/** État de la feuille, SANS donnée personnelle (nombres et raisons génériques). */
function health_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), tabs = {};
  Object.keys(TAB).forEach(function (k) { tabs[TAB[k]] = !!ss.getSheetByName(TAB[k]); });
  var formations = readFormations_(), sessions = readSessions_(formations), now = now_(), reasons = {};
  sessions.list.forEach(function (s) { s.problems.forEach(function (p) { var k = p.replace(/ligne \d+/, "ligne ?"); reasons[k] = (reasons[k] || 0) + 1; }); });
  var hasTrigger = null;
  try { hasTrigger = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === "tick"; }); } catch (e) { hasTrigger = null; }
  var outbox = { pending: 0, sent: 0, failed: 0, quota: 0 }, ob = table_(TAB.OUTBOX);
  if (ob) for (var r = 1; r < ob.values.length; r++) {
    var st = clean_(get_(ob, ob.values[r], "status"));
    if (st === Q_TODO) outbox.pending++; else if (st === Q_SENT) outbox.sent++; else if (st === Q_FAILED) outbox.failed++;
    else if (st === Q_QUOTA || st === Q_PAUSED) outbox.quota++;
  }
  return {
    status: "ok", version: VERSION, timezone: CONFIG.TIMEZONE, tabs: tabs, automaticTask: hasTrigger,
    signing: !!hmacSecret_(), emailjs: !!emailConfig_(), email: quotaState_(), outbox: outbox,
    sessions: {
      rows: sessions.list.length,
      valid: sessions.list.filter(function (s) { return s.valid; }).length,
      published: sessions.list.filter(function (s) { return s.valid && s.published; }).length,
      upcoming: sessions.list.filter(function (s) { return s.valid && s.published && s.status !== "cancelled" && endOf_(s).getTime() > now.getTime(); }).length,
      problems: reasons
    }
  };
}

var CACHE_KEY = "cfs:sessions:v2";
function clearCache_() { try { CacheService.getScriptCache().remove(CACHE_KEY); } catch (e) { /* expirera seul */ } }

/** GET ?action=sessions|health&ts=…&nonce=…&sig=… — signature = HMAC(secret, ts + "." + nonce + ".GET:" + action). */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {}, action = String(p.action || "sessions");
    var bad = verifySigned_(p.ts, p.nonce, p.sig, "GET:" + action);
    if (bad) return json_({ status: "unauthorized", reason: bad });
    if (action === "health") return json_(health_());
    if (action !== "sessions") return json_({ status: "error" });
    var cache = CacheService.getScriptCache(), hit = cache.get(CACHE_KEY);
    if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
    var text = JSON.stringify(publicSessions_());
    if (text.length < 90000) { try { cache.put(CACHE_KEY, text, CONFIG.CACHE_SECONDS); } catch (err) { /* non gardé */ } }
    return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return json_({ status: "error" });
  }
}

/** POST { ts, nonce, sig, payload: "<JSON>" } — payload = { action, … }. */
function doPost(e) {
  var action = "";
  try {
    var raw = (e && e.postData && e.postData.contents) || "{}";
    if (raw.length > 120000) return json_({ status: "invalid", fields: { body: "too_long" } });
    var env = {};
    try { env = JSON.parse(raw) || {}; } catch (err) { env = {}; }
    if (typeof env.payload !== "string") return json_({ status: "unauthorized", reason: "bad_envelope" });
    var bad = verifySigned_(env.ts, env.nonce, env.sig, env.payload);
    if (bad) {
      try { log_("Sécurité", "", "Alerte", "Appel refusé (" + bad + ")."); } catch (e2) { /* journal indisponible */ }
      return json_({ status: "unauthorized", reason: bad });
    }
    var body = {};
    try { body = JSON.parse(env.payload) || {}; } catch (err) { body = {}; }
    if (typeof body !== "object" || Array.isArray(body)) body = {};
    action = String(body.action || "");
    var handlers = {
      book: submitBooking_, attachPayment: attachPayment_, confirmPayment: confirmPayment_, expire: expireBooking_,
      cancel: cancelBooking_, paymentInfo: paymentInfo_, listForUser: listForUser_, contact: submitContact_,
      upsertProfiles: upsertProfiles_, anonymizeUser: anonymizeUser_, backup: backup_, countEmail: countEmail_,
      enqueueEmail: enqueueEmail_, accountingExport: accountingExportJson_
    };
    if (!handlers[action]) return json_({ status: "error", reason: "unknown_action" });
    return json_(handlers[action](body));
  } catch (err) {
    try { log_(action || "Appel", "", "Erreur", String(err && err.message || err).slice(0, 300)); } catch (e3) { /* journal indisponible */ }
    return json_({ status: "error" });
  }
}

/* ======================================================================= validation */

var EMAIL_RE = /^[^@\s"<>]+@[^@\s"<>]+\.[^@\s"<>]{2,}$/;
var REQUEST_RE = /^[A-Za-z0-9_-]{8,64}$/;
var SESSION_RE = /^[a-z0-9][a-z0-9-]{2,79}$/;
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
var REF_RE = /^CF[SD]-\d{4}-[A-Z2-9]{5,6}$/;
var PHONE_RE = /^[0-9+().\/\s-]{6,40}$/;
var PAGE_RE = /^\/[A-Za-z0-9._\/-]{0,160}$/;
var MOLLIE_RE = /^tr_[A-Za-z0-9]{6,40}$/;

/** Numéro de TVA belge : BE0 ou BE1 + 9 chiffres, chiffre de contrôle modulo 97 (même règle que site/src/assets/js/vat.js). */
function belgianVat_(v) {
  var s = String(v || "").toUpperCase().replace(/[\s.\-]/g, "");
  if (s.indexOf("BE") === 0) s = s.slice(2);
  if (/^\d{9}$/.test(s)) s = "0" + s;
  if (!/^[01]\d{9}$/.test(s)) return null;
  var base = Number(s.slice(0, 8)), check = Number(s.slice(8));
  return 97 - (base % 97) === check ? "BE" + s : null;
}

/** Revalide TOUT (le Worker valide déjà, mais la feuille ne fait confiance à personne). */
function validateOrder_(body, formations) {
  var fields = {};
  var c = body.customer && typeof body.customer === "object" ? body.customer : {};
  var b = body.billing && typeof body.billing === "object" ? body.billing : {};
  var order = {
    requestId: String(body.requestId == null ? "" : body.requestId),
    userId: String(body.userId || "").toLowerCase(),
    lang: lang_(body.lang),
    payMode: body.payMode === "invoice" ? "invoice" : body.payMode === "online" ? "online" : "",
    vatRate: Number(body.vatRate),
    customer: { firstName: clean_(c.firstName), lastName: clean_(c.lastName), email: clean_(c.email).toLowerCase(), phone: clean_(c.phone) },
    billing: { type: b.type === "company" ? "company" : "individual", company: clean_(b.company), vat: clean_(b.vat),
      street: clean_(b.street), zip: clean_(b.zip), city: clean_(b.city), country: clean_(b.country || "BE") },
    notes: cleanText_(body.notes, 1000),
    items: []
  };
  if (!REQUEST_RE.test(order.requestId)) fields.requestId = "invalid";
  // Compte facultatif : réservation possible sans compte (rattachée plus tard par l'adresse e-mail vérifiée)
  if (order.userId && !UUID_RE.test(order.userId)) fields.userId = "invalid";
  if (!order.payMode) fields.payMode = "invalid";
  if (!(order.vatRate >= 0 && order.vatRate <= 0.3)) fields.vatRate = "invalid";
  ["firstName", "lastName"].forEach(function (k) { if (!order.customer[k]) fields[k] = "required"; else if (order.customer[k].length > 80) fields[k] = "too_long"; });
  if (!EMAIL_RE.test(order.customer.email) || order.customer.email.length > 160) fields.email = "invalid";
  if (!PHONE_RE.test(order.customer.phone)) fields.phone = "invalid";
  ["street", "zip", "city"].forEach(function (k) { if (!order.billing[k]) fields[k] = "required"; });
  var BLIM = { company: 120, vat: 20, street: 160, zip: 12, city: 80, country: 40 };
  Object.keys(BLIM).forEach(function (k) { if (order.billing[k].length > BLIM[k]) fields[k] = "too_long"; });
  if (order.billing.type === "company") {
    if (!order.billing.company) fields.company = "required";
    if (order.billing.vat) { var v = belgianVat_(order.billing.vat); if (!v) fields.vat = "invalid"; else order.billing.vat = v; }
  }
  if (order.payMode === "invoice" && !(order.billing.type === "company" && order.billing.vat && !fields.vat)) fields.payMode = "invoice_needs_vat";

  var items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.length > CONFIG.MAX_ITEMS) fields.items = "invalid";
  var seen = {};
  items.slice(0, CONFIG.MAX_ITEMS).forEach(function (it) {
    if (!it || typeof it !== "object") { fields.items = "invalid"; return; }
    var f = formations.byId[String(it.training || "").toLowerCase()];
    var q = Number(it.quantity);
    var sid = it.sessionId == null || it.sessionId === "" ? null : String(it.sessionId);
    if (!f || !f.bookable) { fields.items = "unknown_training"; return; }
    if (!(q >= 1 && q <= CONFIG.MAX_SEATS_PER_ITEM) || Math.floor(q) !== q) { fields.items = "invalid_quantity"; return; }
    if (sid !== null && !SESSION_RE.test(sid)) { fields.items = "invalid_session"; return; }
    var key = f.id + "|" + (sid || "");
    if (seen[key]) { fields.items = "duplicate"; return; }
    seen[key] = true;
    var people = Array.isArray(it.participants) ? it.participants.slice(0, q).map(function (p) {
      p = p && typeof p === "object" ? p : {};
      var e = clean_(p.email, 160).toLowerCase();
      return { firstName: clean_(p.firstName, 80), lastName: clean_(p.lastName, 80), email: EMAIL_RE.test(e) ? e : "" };
    }).filter(function (p) { return p.firstName || p.lastName; }) : [];
    order.items.push({ training: f.id, trainingName: f.name, sessionId: sid, quantity: q, participants: people, unitPrice: f.price });
  });
  if (order.payMode === "online" && order.items.some(function (it) { return !it.sessionId || !(it.unitPrice > 0); })) fields.payMode = "online_unavailable";
  return { order: order, fields: fields };
}

/** Montants en centimes (même calcul que site/src/assets/js/pricing.js : arrondi à l'entier le plus proche). */
function amounts_(items, vatRate) {
  var excl = 0, priced = true;
  items.forEach(function (it) {
    if (!it.sessionId) return;
    if (!(it.unitPrice > 0)) { priced = false; return; }
    excl += Math.round(it.unitPrice * 100) * it.quantity;
  });
  if (!priced) return null;
  var vat = Math.round(excl * vatRate);
  return { exclCents: excl, vatCents: vat, inclCents: excl + vat, vatRate: vatRate };
}

/** Limites d'envoi. Renvoie le nombre de secondes à attendre (0 = autorisé), et compte la demande si autorisée. */
function rateLimit_(email, kind) {
  var cache = CacheService.getScriptCache(), k = kind === "c" ? "c" : "r";
  var L = k === "c" ? { hour: CONFIG.CONTACT_GLOBAL_PER_HOUR, six: CONFIG.CONTACT_GLOBAL_PER_6_HOURS, email: CONFIG.CONTACT_PER_EMAIL_PER_HOUR }
    : { hour: CONFIG.GLOBAL_PER_HOUR, six: CONFIG.GLOBAL_PER_6_HOURS, email: CONFIG.PER_EMAIL_PER_HOUR };
  var t = now_().getTime(), hour = Math.floor(t / 3600000), quarter = Math.floor(t / 21600000);
  var untilHour = Math.ceil(((hour + 1) * 3600000 - t) / 1000), untilQuarter = Math.ceil(((quarter + 1) * 21600000 - t) / 1000);
  var counters = [
    { k: k + ":h:" + hour, limit: L.hour, ttl: untilHour + 60, retry: untilHour },
    { k: k + ":q:" + quarter, limit: L.six, ttl: Math.min(21600, untilQuarter + 60), retry: untilQuarter },
    { k: k + ":e:" + hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email, Utilities.Charset.UTF_8)).slice(0, 40) + ":" + hour, limit: L.email, ttl: untilHour + 60, retry: untilHour }
  ];
  var values = cache.getAll(counters.map(function (c) { return c.k; })) || {};
  for (var i = 0; i < counters.length; i++) if (Number(values[counters[i].k] || 0) >= counters[i].limit) return Math.max(60, counters[i].retry);
  counters.forEach(function (c) { cache.put(c.k, String(Number(values[c.k] || 0) + 1), Math.min(21600, Math.max(60, c.ttl))); });
  return 0;
}

var REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // sans 0/O ni 1/I (lisible au téléphone)
/** Référence lisible : CFS-AAAA-XXXXX (réservation) ou CFD-AAAA-XXXXX (demande). */
function newReference_(taken, prefix) {
  var year = fmt_(now_(), "yyyy"), pre = prefix || "CFS";
  for (var tries = 0; tries < 50; tries++) {
    var s = "";
    for (var i = 0; i < 5; i++) s += REF_CHARS.charAt(Math.floor(Math.random() * REF_CHARS.length));
    var ref = pre + "-" + year + "-" + s;
    if (!taken[ref]) return ref;
  }
  return pre + "-" + year + "-" + now_().getTime().toString(36).toUpperCase().replace(/[01IO]/g, "Z").slice(-6);
}

/* ======================================================================= réservation (action « book ») */

function statusCode_(s) {
  return s === "confirmed" ? "confirmed" : s === "pending_pay" ? "pending_payment" : s === "pending_invoice" ? "pending_invoice"
    : s === "request" ? "request" : s === "cancelled" ? "cancelled" : s === "expired" ? "expired" : "unknown";
}

/**
 * Enregistre une réservation (compte confirmé requis : le Worker transmet l'identifiant Supabase vérifié).
 * Places vérifiées puis écrites SOUS VERROU ; tout ou rien ; un requestId déjà vu renvoie la même référence.
 * @returns ok | invalid (fields) | unavailable (problems) | rate_limited | busy
 */
function submitBooking_(body) {
  var formations = readFormations_();
  var v = validateOrder_(body, formations);
  if (Object.keys(v.fields).length) return { status: "invalid", fields: v.fields };
  var order = v.order;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { status: "busy" };
  var result;
  try {
    var now = now_(), bookings = readBookings_();
    if (!bookings.t) { setupTabs_(); bookings = readBookings_(); }
    var already = bookings.rows.filter(function (b) { return b.request && b.request === order.requestId; });
    if (already.length) {
      var amt0 = already[0].amountIncl != null ? { exclCents: Math.round(already[0].amountExcl * 100), inclCents: Math.round(already[0].amountIncl * 100) } : null;
      return { status: "ok", duplicate: true, reference: already[0].ref, payMode: order.payMode, lang: order.lang,
        expiresAt: already[0].expires ? fmt_(already[0].expires, "yyyy-MM-dd'T'HH:mm") : null, amounts: amt0,
        items: already.map(function (b) { return { training: (formations.find(b.training) || {}).id || null, sessionId: b.session || null, seats: b.seats, status: statusCode_(b.status) }; }) };
    }
    var wait = rateLimit_(order.customer.email);
    if (wait > 0) return { status: "rate_limited", retryAfter: wait };

    var sessions = readSessions_(formations), taken = taken_(bookings.rows, now);
    var need = {}, problems = [];
    order.items.forEach(function (it) { if (it.sessionId) need[it.sessionId] = (need[it.sessionId] || 0) + it.quantity; });
    order.items.forEach(function (it) {
      if (!it.sessionId || need[it.sessionId] === -1) return;
      var s = sessions.byId[it.sessionId];
      if (!s || !s.valid || !s.published || s.training !== it.training) { problems.push({ sessionId: it.sessionId, reason: "unknown" }); need[it.sessionId] = -1; return; }
      var remaining = Math.max(0, s.capacity - (taken[s.id] || 0)), st = publicStatus_(s, remaining, now);
      if (st === "cancelled" || st === "closed") problems.push({ sessionId: s.id, reason: st, remaining: remaining });
      else if (remaining <= 0) problems.push({ sessionId: s.id, reason: "full", remaining: 0 });
      else if (need[s.id] > remaining) problems.push({ sessionId: s.id, reason: "insufficient", remaining: remaining });
      need[s.id] = -1;
    });
    if (problems.length) return { status: "unavailable", problems: problems };

    var amounts = amounts_(order.items, order.vatRate);
    var refs = {};
    bookings.rows.forEach(function (b) { if (b.ref) refs[b.ref] = true; });
    var ref = newReference_(refs, "CFS"), people = table_(TAB.PEOPLE);
    var online = order.payMode === "online";
    var expires = new Date(now.getTime() + (online ? CONFIG.PAY_ONLINE_MINUTES * 60000 : CONFIG.INVOICE_HOURS * 3600000));
    var c = order.customer, bi = order.billing;
    var address = [bi.street, [bi.zip, bi.city].join(" ").trim(), bi.country].filter(Boolean).join(", ");
    var bookingRows = [], peopleRows = [], items = [];
    order.items.forEach(function (it) {
      var s = it.sessionId ? sessions.byId[it.sessionId] : null;
      var status = !s ? B_REQUEST : online ? B_PENDING_PAY : B_PENDING_INV;
      var lineExcl = s && it.unitPrice > 0 ? Math.round(it.unitPrice * 100) * it.quantity / 100 : "";
      var names = it.participants.map(function (p) { return [p.firstName, p.lastName].join(" ").trim(); }).join(" · ") || "À communiquer";
      bookingRows.push(rowFor_(bookings.t, {
        received: now, ref: ref, session: s ? s.id : "", training: it.trainingName, when: s ? whenText_(s) : "À convenir",
        seats: it.quantity, status: status, expires: s ? expires : "",
        pay_mode: s ? (online ? M_ONLINE : M_INVOICE) : "", pay_status: s ? (online ? P_WAIT : P_INVOICE) : "",
        amount_excl: lineExcl, amount_incl: lineExcl !== "" ? Math.round(Math.round(lineExcl * 100) * (1 + order.vatRate)) / 100 : "",
        company: asText_(bi.type === "company" ? bi.company : ""), vat: asText_(bi.vat), address: asText_(address),
        contact: asText_([c.firstName, c.lastName].join(" ")), email: asText_(c.email), phone: asText_(c.phone),
        lang: order.lang, participants: asText_(names), notes: asText_(order.notes),
        request: order.requestId, user_id: order.userId
      }));
      it.participants.forEach(function (p) {
        if (people) peopleRows.push(rowFor_(people, { ref: ref, session: s ? s.id : "", training: it.trainingName, first: asText_(p.firstName), last: asText_(p.lastName), email: asText_(p.email) }));
      });
      items.push({ training: it.training, sessionId: s ? s.id : null, seats: it.quantity, status: statusCode_(bookingStatus_(status)), unitPrice: it.unitPrice });
    });
    appendRows_(bookings.t, bookingRows);
    if (people) appendRows_(people, peopleRows);
    var takenNow = taken_(readBookings_().rows, now);
    refreshCounts_(sessions, takenNow);
    // Places restantes renvoyées au site : la personne qui vient de réserver voit tout de suite « 9 sur 10 »
    items.forEach(function (i) {
      var ss = i.sessionId ? sessions.byId[i.sessionId] : null;
      if (ss && ss.capacity > 0) { i.capacity = ss.capacity; i.remaining = Math.max(0, ss.capacity - (takenNow[i.sessionId] || 0)); }
    });
    SpreadsheetApp.flush();
    log_("Réservation", ref, "Info", "Nouvelle réservation (" + (online ? M_ONLINE : M_INVOICE) + ") : " + items.map(function (i) { return (i.sessionId || i.training) + " ×" + i.seats; }).join(", "));
    // Sur facture : e-mail au client tout de suite (P1), équipe en copie cachée. En ligne : e-mail au paiement confirmé.
    if (!online && items.some(function (i) { return i.sessionId; })) {
      queueClient_("Réservation (facture)", "P1", c.email, order.lang, tr_(order.lang, "email.invoice_subject", { ref: ref }), tr_(order.lang, "email.invoice_title"),
        bookingMailInner_(order.lang, c.firstName, tr_(order.lang, "email.invoice_body"), ref, items, sessions, amounts, "email.pay_invoice"), ref, null, CONFIG.TEAM_EMAIL);
    }
    result = { status: "ok", reference: ref, payMode: order.payMode, lang: order.lang, items: items, amounts: amounts,
      expiresAt: fmt_(expires, "yyyy-MM-dd'T'HH:mm") };
  } finally {
    lock.releaseLock();
  }
  clearCache_();
  if (result && result.status === "ok" && !result.duplicate && order.payMode === "invoice") processOutbox_(3);
  return result;
}

/** Lignes d'une référence. */
function rowsOf_(bookings, ref) { return bookings.rows.filter(function (b) { return b.ref === ref; }); }

function addPaymentRow_(ref, mollieId, amount, method, status, note) {
  var t = table_(TAB.PAYMENTS);
  if (t) appendRows_(t, [rowFor_(t, { when: now_(), ref: ref, mollie_id: asText_(mollieId || ""), amount: amount == null ? "" : amount, method: asText_(method || ""), status: status, note: asText_(note || "") })]);
}

/** Rattache le paiement Mollie créé par le Worker à la réservation. */
function attachPayment_(body) {
  var ref = String(body.ref || ""), mollieId = String(body.mollieId || "");
  if (!REF_RE.test(ref) || !MOLLIE_RE.test(mollieId)) return { status: "invalid" };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { status: "busy" };
  try {
    var b = readBookings_(), rows = rowsOf_(b, ref).filter(function (r) { return r.status === "pending_pay"; });
    if (!rows.length) return { status: "not_found" };
    rows.forEach(function (r) { setCell_(b.t, r.line, "mollie_id", mollieId); });
    var total = rows.reduce(function (n, r) { return n + (r.amountIncl || 0); }, 0);
    addPaymentRow_(ref, mollieId, Math.round(total * 100) / 100, "", "Créé", "Paiement en ligne créé");
    SpreadsheetApp.flush();
    return { status: "ok" };
  } finally { lock.releaseLock(); }
}

/** Résumé d'une réservation pour un e-mail (aucune donnée de paiement sensible). */
function bookingSummary_(rows, sessions) {
  var first = rows[0];
  return {
    ref: first.ref, lang: first.lang, email: first.email, contact: first.contact, company: first.company,
    payMode: first.payMode === M_ONLINE ? "online" : first.payMode === M_INVOICE ? "invoice" : "",
    amountExcl: rows.reduce(function (n, r) { return n + (r.amountExcl || 0); }, 0),
    amountIncl: rows.reduce(function (n, r) { return n + (r.amountIncl || 0); }, 0),
    items: rows.map(function (r) {
      var s = sessions && r.session ? sessions.byId[r.session] : null;
      return { trainingName: r.training, training: s ? s.training : null, sessionId: r.session || null, when: r.when, seats: r.seats,
        date: s ? s.date : null, endDate: s ? s.endDate || null : null, startTime: s ? s.start || null : null, endTime: s ? s.end || null : null,
        location: s ? s.location : null, status: statusCode_(r.status) };
    })
  };
}

/**
 * Paiement réussi (le Worker a RELU le paiement auprès de Mollie). Idempotent : un second appel ne confirme rien
 * de plus et ne renvoie pas d'e-mail. Si le paiement arrive après l'expiration ET que les places ont été reprises,
 * la réservation n'est pas confirmée : « Remboursement à faire » + alerte à l'équipe.
 */
function confirmPayment_(body) {
  var sendNow = false;
  var ref = String(body.ref || ""), mollieId = String(body.mollieId || ""), cents = Number(body.amountCents);
  if (!REF_RE.test(ref) || !MOLLIE_RE.test(mollieId) || !(cents > 0)) return { status: "invalid" };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { status: "busy" };
  var out;
  try {
    var now = now_(), b = readBookings_(), rows = rowsOf_(b, ref).filter(function (r) { return r.session; });
    if (!rows.length) return { status: "not_found" };
    if (rows.some(function (r) { return r.mollieId && r.mollieId !== mollieId; })) {
      log_("Paiement", ref, "Alerte", "Paiement " + mollieId + " ne correspond pas à la réservation (attendu " + rows[0].mollieId + ").");
      return { status: "mismatch" };
    }
    var expected = Math.round(rows.reduce(function (n, r) { return n + (r.amountIncl || 0); }, 0) * 100);
    if (expected !== cents) {
      log_("Paiement", ref, "Alerte", "Montant payé " + (cents / 100) + " € ≠ montant attendu " + (expected / 100) + " €. Rien n'est confirmé.");
      return { status: "amount_mismatch" };
    }
    var formations = readFormations_(), sessions = readSessions_(formations);
    if (rows.every(function (r) { return r.status === "confirmed" && r.payStatus === P_PAID; })) {
      return { status: "ok", already: true, confirmed: true, conflict: false, booking: bookingSummary_(rows, sessions) };
    }
    if (rows.some(function (r) { return r.payStatus === P_REFUND; })) return { status: "ok", already: true, confirmed: false, conflict: true, booking: bookingSummary_(rows, sessions) };
    /* Places disponibles SANS compter ces lignes (elles ont pu expirer pendant le paiement). */
    var mine = {};
    rows.forEach(function (r) { mine[r.line] = true; });
    var others = b.rows.filter(function (r) { return !mine[r.line]; }), taken = taken_(others, now), conflict = false;
    rows.forEach(function (r) {
      if (r.status === "confirmed") return;
      var s = sessions.byId[r.session];
      var left = s ? Math.max(0, s.capacity - (taken[s.id] || 0)) : 0;
      if (r.status === "cancelled" || !s || s.status === "cancelled" || left < r.seats) conflict = true;
    });
    rows.forEach(function (r) {
      if (conflict) { setCell_(b.t, r.line, "pay_status", P_REFUND); if (r.status === "pending_pay") setCell_(b.t, r.line, "status", B_EXPIRED); }
      else { setCell_(b.t, r.line, "status", B_CONFIRMED); setCell_(b.t, r.line, "pay_status", P_PAID); setCell_(b.t, r.line, "expires", ""); }
      setCell_(b.t, r.line, "mollie_id", mollieId);
    });
    addPaymentRow_(ref, mollieId, cents / 100, clean_(body.method, 40), conflict ? "Payé — à rembourser" : "Payé", conflict ? "Places reprises entre-temps" : "");
    refreshCounts_(sessions, taken_(readBookings_().rows, now));
    SpreadsheetApp.flush();
    if (conflict) {
      log_("Paiement", ref, "Alerte", "Paiement reçu mais les places ne sont plus disponibles : remboursement à faire dans Mollie.");
      queueTeamAlert_("Remboursement à faire " + ref, "<p>Le paiement <b>" + esc_(mollieId) + "</b> (" + esc_(String(cents / 100)) + " €) de la réservation <b>" + esc_(ref) +
        "</b> est arrivé après l'expiration, et les places ont été reprises. Remboursez ce paiement depuis le tableau de bord Mollie, puis prévenez le client.</p>", ref);
    } else {
      log_("Paiement", ref, "Info", "Paiement confirmé (" + (cents / 100) + " €).");
      var paidRows = rowsOf_(readBookings_(), ref).filter(function (r) { return r.session; }), first = paidRows[0];
      if (first && first.email) {
        var plang = first.lang || "fr";
        var paidItems = paidRows.map(function (r) { var ss = sessions.byId[r.session]; return { training: ss ? ss.training : r.training, trainingName: r.training, sessionId: r.session, seats: r.seats }; });
        var excl = Math.round(paidRows.reduce(function (n, r) { return n + (r.amountExcl || 0); }, 0) * 100);
        queueClient_("Paiement reçu", "P1", first.email, plang, tr_(plang, "email.paid_subject", { ref: ref }), tr_(plang, "email.paid_title"),
          bookingMailInner_(plang, String(first.contact || "").split(" ")[0], tr_(plang, "email.paid_body", { amount: centsText_(cents, plang) }), ref, paidItems, sessions,
            { exclCents: excl, vatCents: cents - excl, inclCents: cents }, "email.pay_online"), ref, null, CONFIG.TEAM_EMAIL);
        sendNow = true;
      }
    }
    out = { status: "ok", already: false, confirmed: !conflict, conflict: conflict, booking: bookingSummary_(rowsOf_(readBookings_(), ref).filter(function (r) { return r.session; }), sessions) };
  } finally { lock.releaseLock(); }
  if (sendNow) processOutbox_(3);
  clearCache_();
  return out;
}

/** Paiement échoué, abandonné ou expiré : places libérées (idempotent). */
function expireBooking_(body) {
  var ref = String(body.ref || ""), reason = String(body.reason || "expired");
  if (!REF_RE.test(ref)) return { status: "invalid" };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { status: "busy" };
  try {
    var b = readBookings_(), rows = rowsOf_(b, ref).filter(function (r) { return r.status === "pending_pay"; });
    if (body.mollieId && rows.some(function (r) { return r.mollieId && r.mollieId !== body.mollieId; })) return { status: "mismatch" };
    var payStatus = reason === "failed" ? P_FAILED : reason === "canceled" ? P_CANCELED : P_EXPIRED;
    rows.forEach(function (r) { setCell_(b.t, r.line, "status", B_EXPIRED); setCell_(b.t, r.line, "pay_status", payStatus); });
    if (rows.length) {
      addPaymentRow_(ref, body.mollieId || rows[0].mollieId, null, "", payStatus, "Places libérées");
      log_("Paiement", ref, "Info", "Paiement " + payStatus.toLowerCase() + " : places libérées.");
      refreshAll_();
      SpreadsheetApp.flush();
    }
    return { status: "ok", released: rows.length };
  } finally { lock.releaseLock(); clearCache_(); }
}

/** Annulation demandée par le Worker (ex. paiement Mollie impossible à créer). Ne touche jamais une ligne payée. */
function cancelBooking_(body) {
  var ref = String(body.ref || "");
  if (!REF_RE.test(ref)) return { status: "invalid" };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { status: "busy" };
  try {
    var b = readBookings_(), now = now_(), n = 0;
    rowsOf_(b, ref).forEach(function (r) {
      if (r.payStatus === P_PAID || r.status === "cancelled" || r.status === "expired") return;
      if (body.userId && r.userId !== String(body.userId)) return;
      setCell_(b.t, r.line, "status", B_CANCELLED); setCell_(b.t, r.line, "cancelled", now); n++;
    });
    if (n) { log_("Réservation", ref, "Info", n + " ligne(s) annulée(s) : " + clean_(body.reason, 120)); refreshAll_(); SpreadsheetApp.flush(); }
    return { status: "ok", cancelled: n };
  } finally { lock.releaseLock(); clearCache_(); }
}

/** État d'une réservation pour la page de retour du paiement (aucune donnée personnelle). */
function paymentInfo_(body) {
  var ref = String(body.ref || "");
  if (!REF_RE.test(ref)) return { status: "invalid" };
  var rows = rowsOf_(readBookings_(), ref).filter(function (r) { return r.session; });
  if (!rows.length) return { status: "not_found" };
  var now = now_(), first = rows[0];
  var state = rows.every(function (r) { return r.status === "confirmed"; }) ? (first.payStatus === P_PAID ? "paid" : "confirmed")
    : first.payStatus === P_REFUND ? "refund" : rows.some(function (r) { return r.status === "pending_pay" && holdsSeats_(r, now); }) ? "pending"
    : rows.some(function (r) { return r.status === "pending_invoice" && holdsSeats_(r, now); }) ? "invoice"
    : first.payStatus === P_FAILED ? "failed" : first.payStatus === P_CANCELED ? "canceled" : "expired";
  return { status: "ok", state: state, mollieId: first.mollieId || null, lang: first.lang, userId: first.userId || null,
    amountCents: Math.round(rows.reduce(function (n, r) { return n + (r.amountIncl || 0); }, 0) * 100),
    items: rows.map(function (r) { return { trainingName: r.training, when: r.when, seats: r.seats }; }) };
}

/** Réservations d'un ou plusieurs comptes (« Mes réservations », vue entreprise). */
function listForUser_(body) {
  var ids = (Array.isArray(body.userIds) ? body.userIds : [body.userId]).map(function (x) { return String(x || "").toLowerCase(); }).filter(function (x) { return UUID_RE.test(x); }).slice(0, 50);
  if (!ids.length) return { status: "invalid" };
  var want = {}; ids.forEach(function (x) { want[x] = true; });
  // Adresse VÉRIFIÉE par Supabase (transmise par le Worker) : réservations faites sans compte avec la même adresse
  var mail = ids.length === 1 && EMAIL_RE.test(String(body.email || "")) ? String(body.email).toLowerCase() : "";
  var b = readBookings_(), now = now_(), byRef = {}, order = [];
  var formations = readFormations_(), sessions = readSessions_(formations);
  b.rows.forEach(function (r) {
    if (!(r.userId && want[r.userId]) && !(mail && !r.userId && r.email.toLowerCase() === mail)) return;
    if (!byRef[r.ref]) {
      byRef[r.ref] = { ref: r.ref, userId: r.userId || ids[0], received: isDate_(r.received) ? fmt_(r.received, "yyyy-MM-dd'T'HH:mm") : null,
        payMode: r.payMode === M_ONLINE ? "online" : r.payMode === M_INVOICE ? "invoice" : null, payStatus: r.payStatus || null,
        amountInclCents: 0, items: [], participants: [] };
      order.push(r.ref);
    }
    var s = r.session ? sessions.byId[r.session] : null;
    var st = r.status === "pending_pay" || r.status === "pending_invoice" ? (holdsSeats_(r, now) ? statusCode_(r.status) : "expired") : statusCode_(r.status);
    byRef[r.ref].amountInclCents += Math.round((r.amountIncl || 0) * 100);
    byRef[r.ref].items.push({ training: s ? s.training : (formations.find(r.training) || {}).id || null, trainingName: r.training, sessionId: r.session || null,
      date: s ? s.date : null, endDate: s ? s.endDate || null : null, startTime: s ? s.start || null : null, endTime: s ? s.end || null : null,
      location: s ? s.location : null, seats: r.seats, status: st });
  });
  var people = table_(TAB.PEOPLE);
  if (people) for (var i = 1; i < people.values.length; i++) {
    var p = people.values[i], ref = clean_(get_(people, p, "ref"));
    if (!byRef[ref]) continue;
    var vu = get_(people, p, "valid_until");
    byRef[ref].participants.push({ firstName: clean_(get_(people, p, "first"), 80), lastName: clean_(get_(people, p, "last"), 80),
      training: clean_(get_(people, p, "training"), 160), result: clean_(get_(people, p, "result"), 40),
      validUntil: isDate_(vu) ? fmt_(vu, "yyyy-MM-dd") : cellDate_(vu) || null });
  }
  return { status: "ok", reservations: order.reverse().map(function (r) { return byRef[r]; }) };
}

/* ======================================================================= demandes sans compte (action « contact ») */

var CONTACT_FORMS = {
  contact: { label: "Contact", subject: "Question" },
  devis: { label: "Devis", subject: "Demande de devis (formation en entreprise)" },
  inscription: { label: "Inscription", subject: "Demande d'inscription" },
  salle: { label: "Location de salle", subject: "Location de salle" },
  prevenir: { label: "Être prévenu", subject: "Être prévenu des prochaines dates" },
  assistant: { label: "Assistant", subject: "Question transmise par l'assistant du site" }
};

function validateContact_(body) {
  var fields = {}, form = CONTACT_FORMS[String(body.form || "")];
  var req = {
    requestId: String(body.requestId == null ? "" : body.requestId), form: form ? String(body.form) : "", lang: lang_(body.lang),
    name: clean_(body.name), email: clean_(body.email).toLowerCase(), phone: clean_(body.phone), company: clean_(body.company),
    message: cleanText_(body.message), training: clean_(body.training, 64).toLowerCase(), session: clean_(body.sessionId, 80),
    page: PAGE_RE.test(String(body.page || "")) ? String(body.page) : "", details: []
  };
  if (!REQUEST_RE.test(req.requestId)) fields.requestId = "invalid";
  if (!form) { fields.form = "invalid"; return { req: req, fields: fields }; }
  if (!req.name || !/[^\s0-9!-\/:-@\[-`{-~]/.test(req.name)) fields.name = "required";
  else if (req.name.length > 120) fields.name = "too_long";
  if (req.email.length > 160 || !EMAIL_RE.test(req.email)) fields.email = "invalid";
  if (req.phone && (req.phone.length > 40 || !PHONE_RE.test(req.phone))) fields.phone = "invalid";
  if (req.company.length > 120) fields.company = "too_long";
  if (req.message.length > 5000) fields.message = "too_long";
  else if (req.form === "contact" && req.message.length < 3) fields.message = "required";
  if (req.training && !/^[a-z0-9][a-z0-9-]{1,60}$/.test(req.training)) fields.training = "invalid";
  if (req.session && !SESSION_RE.test(req.session)) fields.sessionId = "invalid";
  if (body.consent !== true) fields.consent = "required";
  var details = Array.isArray(body.details) ? body.details : [];
  if (details.length > 12) fields.details = "invalid";
  details.slice(0, 12).forEach(function (d) {
    if (!Array.isArray(d) || d.length !== 2) { fields.details = "invalid"; return; }
    var label = clean_(d[0]), value = clean_(d[1]);
    if (!label || label.length > 60 || value.length > 400) { fields.details = "invalid"; return; }
    if (value) req.details.push([label, value]);
  });
  req.subject = form.subject;
  return { req: req, fields: fields };
}
function looksLikeSpam_(req) {
  var text = [req.name, req.company, req.message].concat(req.details.map(function (d) { return d[1]; })).join(" ");
  return (text.match(/https?:\/\/|www\./gi) || []).length >= 4;
}

/** Enregistre une demande (onglet « Demandes ») et réserve, si demandé, une place dans le quota d'e-mails (P2). */
function submitContact_(body) {
  var elapsed = Number(body.elapsed);
  if (clean_(body.website) || (isFinite(elapsed) && elapsed >= 0 && elapsed < CONFIG.CONTACT_MIN_FILL_MS)) {
    return { status: "ok", reference: newReference_({}, "CFD"), ignored: true };
  }
  var v = validateContact_(body);
  if (Object.keys(v.fields).length) return { status: "invalid", fields: v.fields };
  var req = v.req, form = CONTACT_FORMS[req.form], formations = readFormations_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { status: "busy" };
  var ref, spam = looksLikeSpam_(req), email = null;
  try {
    ensureTab_(TAB.REQUESTS);
    var t = table_(TAB.REQUESTS), refs = {};
    for (var r = 1; r < t.values.length; r++) {
      var row = t.values[r], key = String(get_(t, row, "request") || "");
      refs[clean_(get_(t, row, "ref"))] = true;
      if (key && key === req.requestId) return { status: "ok", reference: clean_(get_(t, row, "ref")), duplicate: true };
    }
    var wait = rateLimit_(req.email, "c");
    if (wait > 0) return { status: "rate_limited", retryAfter: wait };
    ref = newReference_(refs, "CFD");
    var f = req.training ? formations.byId[req.training] : null;
    appendRows_(t, [rowFor_(t, {
      received: now_(), ref: ref, form: form.label, subject: req.subject, training: f ? f.name : "", session: asText_(req.session),
      name: asText_(req.name), email: asText_(req.email), phone: asText_(req.phone), company: asText_(req.company),
      message: asText_(req.message), details: asText_(req.details.map(function (d) { return d[0] + " : " + d[1]; }).join("\n")),
      page: asText_(req.page), lang: req.lang, status: spam ? R_SPAM : R_NEW, mailed: spam ? "Non (indésirable)" : "En cours", request: req.requestId
    })]);
    SpreadsheetApp.flush();
    if (!spam && body.reserveEmail) email = reserveQuota_("P2", 1, "Demande " + ref);
  } finally { lock.releaseLock(); }
  return { status: "ok", reference: ref, spam: spam, email: email, trainingName: req.training && formations.byId[req.training] ? formations.byId[req.training].name : "" };
}

function ensureTab_(name) { if (!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name)) setupTab_(SpreadsheetApp.getActiveSpreadsheet(), name); }

/* ======================================================================= comptes (miroir, RGPD, sauvegardes) */

/** Miroir en LECTURE SEULE des comptes du site (nom, société, e-mail, langue, date de création : rien d'autre). */
function upsertProfiles_(body) {
  var list = Array.isArray(body.profiles) ? body.profiles.slice(0, 5000) : null;
  if (!list) return { status: "invalid" };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { status: "busy" };
  try {
    ensureTab_(TAB.PROFILES);
    var t = table_(TAB.PROFILES), now = now_();
    var rows = list.filter(function (p) { return p && UUID_RE.test(String(p.id || "")); }).map(function (p) {
      return rowFor_(t, { user_id: String(p.id), name: asText_(clean_(p.name, 160)), company: asText_(clean_(p.company, 160)),
        email: asText_(clean_(p.email, 160)), lang: lang_(p.lang), created: clean_(p.created, 30) ? new Date(String(p.created)) : "", synced: now });
    });
    var last = t.sheet.getLastRow();
    if (last > 1) t.sheet.getRange(2, 1, last - 1, t.width).clearContent();
    t.values = t.values.slice(0, 1);
    if (rows.length) t.sheet.getRange(2, 1, rows.length, t.width).setValues(rows);
    return { status: "ok", count: rows.length };
  } finally { lock.releaseLock(); }
}

/** Suppression d'un compte : données personnelles effacées ; les réservations payées ou facturées sont anonymisées
    et gardées pour la comptabilité (référence, société, n° de TVA, montants). */
function anonymizeUser_(body) {
  var id = String(body.userId || "").toLowerCase();
  if (!UUID_RE.test(id)) return { status: "invalid" };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { status: "busy" };
  try {
    var b = readBookings_(), refs = {}, n = 0;
    b.rows.forEach(function (r) {
      if (r.userId !== id) return;
      refs[r.ref] = true; n++;
      ["contact", "email", "phone", "participants", "notes"].forEach(function (f) { setCell_(b.t, r.line, f, f === "contact" ? "(compte supprimé)" : ""); });
      setCell_(b.t, r.line, "user_id", "");
      if (!r.company) setCell_(b.t, r.line, "address", "");
    });
    var people = table_(TAB.PEOPLE);
    if (people) for (var i = 1; i < people.values.length; i++) {
      if (!refs[clean_(get_(people, people.values[i], "ref"))]) continue;
      ["first", "last", "email"].forEach(function (f) { setCell_(people, i + 1, f, f === "first" ? "(anonymisé)" : ""); });
    }
    var prof = table_(TAB.PROFILES);
    if (prof) for (var j = 1; j < prof.values.length; j++) {
      if (clean_(get_(prof, prof.values[j], "user_id")) === id) ["user_id", "name", "company", "email", "lang", "created"].forEach(function (f) { setCell_(prof, j + 1, f, ""); });
    }
    log_("RGPD", "", "Info", "Compte supprimé : " + n + " ligne(s) de réservation anonymisée(s).");
    SpreadsheetApp.flush();
    return { status: "ok", anonymized: n };
  } finally { lock.releaseLock(); }
}

/** Dossier Drive des sauvegardes (créé par le script : la portée drive.file suffit). */
function backupFolder_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty("BACKUP_FOLDER_ID");
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recréé ci-dessous */ } }
  var folder = DriveApp.createFolder("Sauvegardes – Centre CFS (privé)");
  p.setProperty("BACKUP_FOLDER_ID", folder.getId());
  return folder;
}

/** Sauvegarde hebdomadaire : profils (JSON) + copie de toutes les valeurs de la feuille dans un nouveau classeur. */
function backup_(body) {
  var folder = backupFolder_(), stamp = fmt_(now_(), "yyyy-MM-dd");
  var profiles = Array.isArray(body.profiles) ? body.profiles : [];
  folder.createFile("profils-" + stamp + ".json", JSON.stringify({ exportedAt: stamp, profiles: profiles }, null, 2), "application/json");
  var src = SpreadsheetApp.getActiveSpreadsheet(), copy = SpreadsheetApp.create("Sauvegarde " + CONFIG.FILE_NAME + " " + stamp);
  src.getSheets().forEach(function (sh) {
    var values = sh.getDataRange().getValues();
    var dst = copy.insertSheet(sh.getName());
    if (values.length && values[0].length) {
      if (dst.getMaxRows() < values.length) dst.insertRowsAfter(dst.getMaxRows(), values.length - dst.getMaxRows());
      if (dst.getMaxColumns() < values[0].length) dst.insertColumnsAfter(dst.getMaxColumns(), values[0].length - dst.getMaxColumns());
      dst.getRange(1, 1, values.length, values[0].length).setValues(values.map(function (r) { return r.map(function (v) { return typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v; }); }));
    }
  });
  var first = copy.getSheets()[0];
  if (first && first.getName() !== src.getSheets()[0].getName() && copy.getSheets().length > 1) copy.deleteSheet(first);
  DriveApp.getFileById(copy.getId()).moveTo(folder);
  /* Garder les CONFIG.BACKUP_KEEP plus récentes de chaque type. */
  ["profils-", "Sauvegarde "].forEach(function (prefix) {
    var files = [], it = folder.getFiles();
    while (it.hasNext()) { var f = it.next(); if (f.getName().indexOf(prefix) === 0) files.push(f); }
    files.sort(function (a, b) { return a.getName() < b.getName() ? 1 : -1; });
    files.slice(CONFIG.BACKUP_KEEP).forEach(function (f) { f.setTrashed(true); });
  });
  log_("Sauvegarde", "", "Info", "Sauvegarde hebdomadaire : " + profiles.length + " profil(s) + copie de la feuille.");
  return { status: "ok", stamp: stamp };
}

/* ======================================================================= e-mails : quota mensuel, file d'envoi, EmailJS */

function emailConfig_() {
  var c = { service: prop_("EMAILJS_SERVICE_ID"), client: prop_("EMAILJS_TEMPLATE_CLIENT"), team: prop_("EMAILJS_TEMPLATE_EQUIPE"),
    publicKey: prop_("EMAILJS_PUBLIC_KEY"), privateKey: prop_("EMAILJS_PRIVATE_KEY") };
  return c.service && c.client && c.team && c.publicKey && c.privateKey ? c : null;
}
function monthKey_() { return fmt_(now_(), "yyyy-MM"); }
function quota_() { var q = Number(prop_("EMAILJS_MONTHLY_QUOTA")); return q > 0 ? q : CONFIG.EMAIL_QUOTA; }
function quotaState_() {
  var used = Number(prop_("EMAIL_COUNT_" + monthKey_()) || 0), quota = quota_();
  return { month: monthKey_(), used: used, quota: quota, state: used >= quota ? "full" : used >= quota * CONFIG.EMAIL_WARN_RATIO ? "warn" : "ok" };
}
/** Une requête EmailJS est-elle permise pour cette priorité ? P1 et P2 jusqu'à 100 %, P3 jusqu'à 80 %. */
function quotaAllows_(priority, used, quota) {
  return priority === "P3" ? used < quota * CONFIG.EMAIL_WARN_RATIO : used < quota;
}
/**
 * Réserve `n` requêtes dans le compteur mensuel partagé (feuille + Worker). Appelée sous verrou, ou prend un verrou
 * court. Déclenche une seule alerte à 80 % (e-mail à l'équipe) et une seule entrée « quota atteint » à 100 %.
 */
function reserveQuota_(priority, n, label) {
  var p = PropertiesService.getScriptProperties(), key = "EMAIL_COUNT_" + monthKey_();
  var used = Number(p.getProperty(key) || 0), quota = quota_();
  if (!quotaAllows_(priority, used + n - 1, quota)) {
    var full = used >= quota;
    if (full && !p.getProperty("EMAIL_FULL_" + monthKey_())) {
      p.setProperty("EMAIL_FULL_" + monthKey_(), "1");
      log_("Quota e-mails", "", "Erreur", "Quota mensuel EmailJS atteint (" + used + "/" + quota + ") : les e-mails restent dans la file d'envoi (« Quota atteint »).");
      markQuotaTab_(true);
    }
    return { allowed: false, used: used, quota: quota, state: full ? "full" : "warn" };
  }
  used += n;
  p.setProperty(key, String(used));
  log_("E-mail", label || "", "Info", priority + " · requête EmailJS n° " + used + "/" + quota + " du mois");
  var warnAt = Math.ceil(quota * CONFIG.EMAIL_WARN_RATIO);
  if (used >= warnAt && !p.getProperty("EMAIL_WARN_" + monthKey_())) {
    p.setProperty("EMAIL_WARN_" + monthKey_(), "1");
    log_("Quota e-mails", "", "Alerte", "80 % du quota EmailJS utilisé (" + used + "/" + quota + ") : rappels (P3) suspendus jusqu'au mois prochain.");
    if (used < quota) {
      p.setProperty(key, String(used + 1));
      queue_({ kind: "Alerte quota", priority: "P1", template: "equipe", to: CONFIG.TEAM_EMAIL, reply: CONFIG.TEAM_EMAIL,
        subject: "[Site] 80 % du quota d'e-mails utilisé (" + used + "/" + quota + ")",
        html: frame_("fr", "Quota d'e-mails : 80 % utilisé", "<p>Ce mois-ci, " + used + " envois sur " + quota + " ont été utilisés. Les rappels (J-2, recyclage) sont suspendus jusqu'au 1er du mois prochain. Les confirmations, annulations et e-mails de connexion continuent jusqu'à 100 %.</p><p>Suivi : onglet « " + TAB.OUTBOX + " » et docs/QUOTAS.md.</p>"),
        text: "80 % du quota EmailJS utilisé (" + used + "/" + quota + ").", counted: true });
    }
  }
  return { allowed: true, used: used, quota: quota, state: used >= quota ? "full" : used >= warnAt ? "warn" : "ok" };
}
function countEmail_(body) {
  var priority = /^P[123]$/.test(String(body.priority)) ? String(body.priority) : "P1", n = Math.min(Math.max(Number(body.n) || 1, 1), 5);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { status: "busy" };
  try { var r = reserveQuota_(priority, n, clean_(body.label, 60) || "Site"); r.status = "ok"; return r; }
  finally { lock.releaseLock(); }
}
function markQuotaTab_(full) {
  try { var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB.OUTBOX); if (sh) sh.setTabColor(full ? "#C8241C" : null); } catch (e) { /* mise en forme facultative */ }
}

/** Ajoute un e-mail à la file d'envoi. Renvoie la ligne (0 = refusé). */
function queue_(m) {
  var t = table_(TAB.OUTBOX);
  if (!t) { ensureTab_(TAB.OUTBOX); t = table_(TAB.OUTBOX); }
  var to = m.template === "equipe" ? CONFIG.TEAM_EMAIL : String(m.to || "");
  if (!EMAIL_RE.test(to)) return 0;
  appendRows_(t, [rowFor_(t, {
    created: now_(), kind: m.kind || "", priority: /^P[123]$/.test(String(m.priority)) ? m.priority : "P1",
    template: m.template === "equipe" ? "equipe" : "client", to: asText_(to), bcc: asText_(EMAIL_RE.test(String(m.bcc || "")) ? m.bcc : ""),
    subject: asText_(clean_(m.subject, 250)), status: Q_TODO, tries: m.counted ? -1 : 0, next: now_(), ref: asText_(m.ref || ""), lang: lang_(m.lang),
    reply: asText_(EMAIL_RE.test(String(m.reply || "")) ? m.reply : ""), html: asText_(String(m.html || "").slice(0, 45000)), text: asText_(String(m.text || "").slice(0, 4000))
  })]);
  return t.values.length;
}
/** File d'envoi alimentée par le Worker (envoi immédiat impossible, ou quota atteint). */
function enqueueEmail_(body) {
  var m = body.email && typeof body.email === "object" ? body.email : {};
  var line = queue_({ kind: clean_(m.kind, 60) || "Site", priority: m.priority, template: m.template, to: m.to, bcc: m.bcc, reply: m.replyTo,
    subject: m.subject, html: m.html, text: m.text, ref: clean_(m.ref, 40), lang: m.lang });
  return line ? { status: "ok" } : { status: "invalid" };
}
function queueTeamAlert_(subject, html, ref) {
  return queue_({ kind: "Alerte équipe", priority: "P1", template: "equipe", to: CONFIG.TEAM_EMAIL, reply: CONFIG.TEAM_EMAIL,
    subject: "[Site] " + subject, html: frame_("fr", subject, html), text: subject, ref: ref });
}

/** Envoi via l'API REST EmailJS (clé privée). Lève une erreur avec .code (statut HTTP). */
function sendEmailJs_(m) {
  var c = emailConfig_();
  if (!c) { var e0 = new Error("EmailJS n'est pas configuré (propriétés du script)"); e0.code = 0; throw e0; }
  var params = m.template === "equipe"
    ? { reply_to: m.reply || CONFIG.TEAM_EMAIL, subject: m.subject, html: m.html, text: m.text }
    : { to_email: m.to, bcc: m.bcc || "", subject: m.subject, html: m.html, text: m.text };
  var res = UrlFetchApp.fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    payload: JSON.stringify({ service_id: c.service, template_id: m.template === "equipe" ? c.team : c.client, user_id: c.publicKey, accessToken: c.privateKey, template_params: params })
  });
  var code = res.getResponseCode();
  if (code !== 200) { var e = new Error("EmailJS a refusé l'envoi (" + code + ") " + clean_(res.getContentText(), 200)); e.code = code; throw e; }
}
function backoffMinutes_(tries) { return [5, 15, 60, 180, 720][Math.min(Math.max(tries - 1, 0), 4)]; }

/** Envoie les e-mails dont l'heure est venue (au plus `limit`), 1,1 s entre deux envois, quota respecté. */
function processOutbox_(limit) {
  var t = table_(TAB.OUTBOX);
  if (!t) return 0;
  var now = now_(), sent = 0, first = true;
  for (var r = 1; r < t.values.length && sent < (limit || 20); r++) {
    var row = t.values[r], st = clean_(get_(t, row, "status"));
    if (st !== Q_TODO && st !== Q_QUOTA && st !== Q_PAUSED) continue;
    var next = get_(t, row, "next");
    if (st === Q_TODO && isDate_(next) && next.getTime() > now.getTime()) continue;
    var line = r + 1, priority = clean_(get_(t, row, "priority")) || "P1", tries = int_(get_(t, row, "tries")) || 0;
    /* tries = -1 : requête déjà comptée au moment de la mise en file (alerte quota). */
    if (tries !== -1) {
      /* Compteur partagé avec le Worker : réservation de la requête sous verrou court (jamais pendant l'envoi). */
      var lk = LockService.getScriptLock(), q = null;
      if (!lk.tryLock(5000)) continue;
      try { q = reserveQuota_(priority, 1, clean_(get_(t, row, "ref")) || clean_(get_(t, row, "kind"))); } finally { lk.releaseLock(); }
      if (!q.allowed) { setCell_(t, line, "status", q.state === "full" ? Q_QUOTA : Q_PAUSED); continue; }
    }
    if (!first) Utilities.sleep(CONFIG.EMAIL_SPACING_MS);
    first = false;
    tries = Math.max(tries, 0) + 1;
    try {
      sendEmailJs_({ template: clean_(get_(t, row, "template")), to: clean_(get_(t, row, "to")), bcc: clean_(get_(t, row, "bcc")),
        reply: clean_(get_(t, row, "reply")), subject: String(get_(t, row, "subject")), html: String(get_(t, row, "html")), text: String(get_(t, row, "text")) });
      setCell_(t, line, "status", Q_SENT); setCell_(t, line, "tries", tries); setCell_(t, line, "error", "");
      sent++;
    } catch (err) {
      var msg = String(err && err.message || err).slice(0, 300), retryable = !err.code || err.code === 429 || err.code >= 500;
      setCell_(t, line, "tries", tries); setCell_(t, line, "error", asText_(msg));
      if (tries >= CONFIG.MAX_SEND_TRIES || !retryable) {
        setCell_(t, line, "status", Q_FAILED);
        log_("E-mail", clean_(get_(t, row, "ref")), "Erreur", "Abandon après " + tries + " essai(s) vers " + clean_(get_(t, row, "to")) + " : " + msg);
        if (clean_(get_(t, row, "kind")) !== "Alerte équipe") queueTeamAlert_("E-mail non envoyé", "<p>Un e-mail « " + esc_(clean_(get_(t, row, "subject"))) + " » n'a pas pu partir après " + tries + " essai(s) : " + esc_(msg) + ".</p><p>Voir l'onglet « " + TAB.OUTBOX + " ».</p>", clean_(get_(t, row, "ref")));
      } else {
        setCell_(t, line, "status", Q_TODO);
        setCell_(t, line, "next", new Date(now.getTime() + backoffMinutes_(tries) * 60000));
      }
    }
  }
  return sent;
}

/* ===== gabarits d'e-mails (même rendu que worker/src/emails/layout.js) ===== */
function tr_(lang, key, vars) {
  var dict = I18N[lang] || I18N.fr, s = dict[key] != null ? dict[key] : (I18N.fr[key] != null ? I18N.fr[key] : key);
  Object.keys(vars || {}).forEach(function (k) { s = s.split("{" + k + "}").join(String(vars[k])); });
  return s;
}
function trainingName_(id, lang, fallback) { var t = TRAINING_NAMES[id]; return t ? t[lang] || t.fr : fallback || id; }
function locationText_(code, lang) {
  if (code === "engis") return "Centre CFS, Rue de la Paix 12, 4480 Engis";
  if (code === "charleroi") return "CEME, Rue des Français 147, 6020 Charleroi";
  return code === "intra" ? tr_(lang, "email.place_intra") : "";
}
function longDate_(day, lang) {
  var p = day.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12));
  var days = tr_(lang, "email.days").split(","), months = tr_(lang, "email.months").split(",");
  return days[d.getUTCDay()] + " " + (+p[2]) + " " + months[+p[1] - 1] + " " + p[0];
}
function frame_(lang, title, inner, cta) {
  var btn = cta ? '<p style="margin:26px 0"><a href="' + esc_(cta.href) + '" style="display:inline-block;background:#F7B500;color:#0F1C2E;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:6px">' + esc_(cta.label) + "</a></p>" : "";
  return '<!doctype html><html lang="' + esc_(lang) + '"><body style="margin:0;background:#F2F5F9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0F1C2E">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">' +
    '<tr><td style="background:#0D4A8C;padding:20px 26px;color:#ffffff"><b style="font-size:20px;letter-spacing:.2px">Centre CFS</b><br><span style="color:#F7B500;font-size:13px">' + esc_(tr_(lang, "email.tagline")) + "</span></td></tr>" +
    '<tr><td style="height:6px;background:repeating-linear-gradient(-45deg,#F7B500 0 10px,#0F1C2E 10px 20px)"></td></tr>' +
    '<tr><td style="padding:26px;font-size:15px;line-height:1.55"><h1 style="font-size:22px;margin:0 0 14px">' + esc_(title) + "</h1>" + inner + btn + "</td></tr>" +
    '<tr><td style="padding:16px 26px;background:#F2F5F9;color:#4A5869;font-size:12px;line-height:1.5">' + esc_(tr_(lang, "email.footer")) + "<br>Centre CFS · Rue de la Paix 12, 4480 Engis · " + esc_(CONFIG.PHONE) + " · info@centrecfs.be</td></tr>" +
    "</table></body></html>";
}
function sessionLine_(s, lang) {
  var when = longDate_(s.date, lang) + (s.endDate ? " → " + longDate_(s.endDate, lang) : "") + (s.start ? ", " + s.start + (s.end ? "–" + s.end : "") : "");
  return "<p><b>" + esc_(trainingName_(s.training, lang, s.trainingName)) + "</b><br>" + esc_(when) + "<br>" + esc_(locationText_(s.location, lang)) + "</p>";
}
function plain_(html) { return String(html).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, "\n\n").trim(); }
function queueClient_(kind, priority, to, lang, subject, title, inner, ref, cta, bcc) {
  var html = frame_(lang, title, inner, cta);
  return queue_({ kind: kind, priority: priority, template: "client", to: to, bcc: bcc || "", lang: lang, subject: subject, html: html, text: plain_(inner), ref: ref });
}

/** « 302,50 € » (fr, nl) ou « €302.50 » (en). */
function centsText_(cents, lang) {
  var v = (Math.round(cents) / 100).toFixed(2);
  return lang === "en" ? "€" + v : v.replace(".", ",") + " €";
}

/** Récapitulatif d'une réservation pour l'e-mail au client (tableau simple, données échappées, jamais de texte libre). */
function bookingMailInner_(lang, name, body, ref, items, sessions, amounts, payKey) {
  var rows = [];
  items.forEach(function (it) {
    var s = it.sessionId ? sessions.byId[it.sessionId] : null;
    rows.push([tr_(lang, "email.l_training"), trainingName_(it.training, lang, it.trainingName || it.training)]);
    if (s) {
      rows.push([tr_(lang, "email.l_date"), longDate_(s.date, lang) + (s.endDate ? " → " + longDate_(s.endDate, lang) : "") + (s.start ? ", " + s.start + (s.end ? "–" + s.end : "") : "")]);
      rows.push([tr_(lang, "email.l_place"), locationText_(s.location, lang)]);
    }
    rows.push([tr_(lang, "email.l_seats"), String(it.seats || it.quantity || "")]);
  });
  if (amounts) {
    rows.push([tr_(lang, "email.l_excl"), centsText_(amounts.exclCents, lang)]);
    rows.push([tr_(lang, "email.l_vat"), centsText_(amounts.vatCents, lang)]);
    rows.push([tr_(lang, "email.l_incl"), centsText_(amounts.inclCents, lang)]);
  }
  if (payKey) rows.push([tr_(lang, "email.l_payment"), tr_(lang, payKey)]);
  var table = '<table role="presentation" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px">' + rows.map(function (r) {
    return '<tr><td style="color:#4A5869;padding-right:16px;vertical-align:top">' + esc_(r[0]) + "</td><td>" + esc_(r[1]) + "</td></tr>";
  }).join("") + "</table>";
  return "<p>" + esc_(name ? tr_(lang, "email.hello", { name: name }) : tr_(lang, "email.hello_anon")) + "</p><p>" + esc_(body) + "</p><p><b>" +
    esc_(tr_(lang, "email.ref", { ref: ref })) + "</b></p>" + table;
}

/* ======================================================================= tâche automatique (toutes les 10 minutes) */

function tick() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    var now = now_(), b = readBookings_();
    if (b.t) b.rows.forEach(function (r) {
      if ((r.status === "pending_pay" || r.status === "pending_invoice") && r.expires && r.expires.getTime() <= now.getTime()) {
        setCell_(b.t, r.line, "status", B_EXPIRED);
        if (r.status === "pending_pay") setCell_(b.t, r.line, "pay_status", P_EXPIRED);
        log_("Réservation", r.ref, "Info", "Réservation en attente expirée : places libérées.");
      }
    });
    completeSessionIds_();
    refreshAll_();
    queueReminders_();
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  clearCache_();
  if (quotaState_().state !== "full") markQuotaTab_(false);
  processOutbox_(20);
  try { purgeOldRequests_(); } catch (err) { log_("Demande", "", "Erreur", "Anonymisation : " + String(err && err.message || err).slice(0, 200)); }
}

/** Rappels J-2 (priorité P3, suspendus au-delà de 80 % du quota) : une fois par session. */
function queueReminders_() {
  var formations = readFormations_(), sessions = readSessions_(formations), now = now_();
  var target = addDays_(fmt_(now, "yyyy-MM-dd"), CONFIG.REMINDER_DAYS_BEFORE), b = null;
  sessions.list.forEach(function (s) {
    if (!s.valid || s.status === "cancelled" || s.date !== target || s.reminded) return;
    b = b || readBookings_();
    var seen = {};
    b.rows.forEach(function (r) {
      if (r.session !== s.id || r.status !== "confirmed" || seen[r.ref] || !EMAIL_RE.test(r.email)) return;
      seen[r.ref] = true;
      var lang = r.lang, epi = s.domain === "equipements";
      var inner = "<p>" + esc_(tr_(lang, "email.hello_anon")) + "</p><p>" + esc_(tr_(lang, "email.reminder_body")) + "</p>" + sessionLine_(s, lang) +
        "<p>" + esc_(tr_(lang, "email.l_seats")) + " : " + r.seats + " · " + esc_(tr_(lang, "email.ref", { ref: r.ref })) + "</p>" +
        (epi ? "<p><b>" + esc_(tr_(lang, "email.reminder_epi")) + "</b></p>" : "") + "<p>" + esc_(tr_(lang, "email.reminder_contact", { phone: CONFIG.PHONE })) + "</p>";
      queueClient_("Rappel J-2", "P3", r.email, lang, tr_(lang, "email.reminder_subject", { training: trainingName_(s.training, lang, s.trainingName), date: longDate_(s.date, lang) }),
        tr_(lang, "email.reminder_title"), inner, r.ref);
    });
    setCell_(sessions.t, s.line, "reminded", fmt_(now, "yyyy-MM-dd HH:mm"));
  });
}

function purgeOldRequests_() {
  var months = Number(CONFIG.REQUEST_RETENTION_MONTHS) || 0, t = table_(TAB.REQUESTS);
  if (months <= 0 || !t) return 0;
  var limit = new Date(now_().getTime()), n = 0;
  limit.setMonth(limit.getMonth() - months);
  for (var r = 1; r < t.values.length; r++) {
    var row = t.values[r], when = get_(t, row, "received");
    if (!isDate_(when) || when.getTime() >= limit.getTime() || clean_(get_(t, row, "status")) === R_ERASED) continue;
    ["name", "email", "phone", "company", "message", "details", "page", "notes"].forEach(function (f) { setCell_(t, r + 1, f, ""); });
    setCell_(t, r + 1, "status", R_ERASED);
    n++;
  }
  if (n) log_("Demande", "", "Info", n + " demande(s) de plus de " + months + " mois anonymisée(s).");
  return n;
}

function log_(kind, target, level, message) {
  var t = table_(TAB.LOG);
  if (!t) return;
  appendRows_(t, [rowFor_(t, { when: now_(), kind: kind, target: asText_(target || ""), level: level, message: asText_(String(message).slice(0, 1000)) })]);
}

/* ======================================================================= menu « Centre CFS » (équipe) */

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Centre CFS")
    .addItem("➕ Nouvelle session", "newSession")
    .addItem("📣 Prévenir les inscrits d'un changement d'horaire…", "notifyScheduleChange")
    .addItem("🔒 Fermer les inscriptions (session sélectionnée)", "closeRegistrations")
    .addItem("🔓 Rouvrir les inscriptions (session sélectionnée)", "reopenRegistrations")
    .addItem("⛔ Annuler la session sélectionnée…", "cancelSession")
    .addItem("📋 Liste des participants (session sélectionnée)", "participantsList")
    .addSeparator()
    .addItem("✔ Confirmer la réservation sélectionnée (paiement sur facture)", "confirmInvoiceBooking")
    .addItem("✖ Annuler la réservation sélectionnée…", "cancelSelectedBooking")
    .addSeparator()
    .addItem("🔎 Vérifier la cohérence", "checkConsistency")
    .addItem("🔄 Synchroniser maintenant", "syncNow")
    .addItem("🌐 Publier sur le site", "publishSite")
    .addItem("👁 Voir ce que le site affiche", "previewSite")
    .addItem("📤 Export comptable (mois précédent)", "accountingExport")
    .addSeparator()
    .addItem("✉ Envoyer un e-mail de test", "sendTestEmail")
    .addItem("🛠 Installer / réparer la feuille", "install")
    .addToUi();
  try {
    var q = quotaState_();
    if (q.state === "full") { markQuotaTab_(true); SpreadsheetApp.getActiveSpreadsheet().toast("⛔ Quota mensuel d'e-mails atteint (" + q.used + "/" + q.quota + ") : les envois attendent dans « " + TAB.OUTBOX + " ».", "Quota e-mails", 30); }
  } catch (e) { /* facultatif */ }
}

/** Modification à la main : identifiants complétés, compteurs recalculés, liste publique renouvelée. */
function onEdit(e) {
  try {
    var sheet = e && e.range ? e.range.getSheet() : null;
    if (!sheet) return;
    var name = sheet.getName();
    if (name !== TAB.SESSIONS && name !== TAB.BOOKINGS && name !== TAB.FORMATIONS) return;
    if (name === TAB.SESSIONS) completeSessionIds_();
    refreshAll_();
    clearCache_();
  } catch (err) { /* une modification ne doit jamais être bloquée */ }
}

/** Identifiant (date-formation-lieu) des sessions qui n'en ont pas, et capacité par défaut proposée. */
function completeSessionIds_() {
  var formations = readFormations_(), sessions = readSessions_(formations), t = sessions.t;
  if (!t) return;
  var used = {};
  sessions.list.forEach(function (s) { if (s.id) used[s.id] = true; });
  sessions.list.forEach(function (s) {
    if (s.id || !s.training || !s.date || !s.location) return;
    var base = s.date + "-" + s.training + "-" + s.location, id = base, n = 2;
    while (used[id]) id = base + "-" + n++;
    used[id] = true;
    setCell_(t, s.line, "id", id);
    if (!s.statusRaw) setCell_(t, s.line, "status", S_OPEN);
    var f = formations.byId[s.training];
    if ((s.capacity === null || isNaN(s.capacity)) && f && f.capacity) setCell_(t, s.line, "capacity", f.capacity);
  });
}

function ui_() { return SpreadsheetApp.getUi(); }
function selectedSession_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sheet = ss.getActiveSheet();
  if (sheet.getName() !== TAB.SESSIONS) { ui_().alert("Cliquez d'abord sur la ligne de la session, dans l'onglet « " + TAB.SESSIONS + " »."); return null; }
  var line = sheet.getActiveRange().getRow(), formations = readFormations_(), sessions = readSessions_(formations);
  var s = sessions.list.filter(function (x) { return x.line === line; })[0];
  if (!s || !s.id) { ui_().alert("Cette ligne n'est pas une session complète (formation, date, lieu et places)."); return null; }
  return { s: s, sessions: sessions, formations: formations };
}

function newSession() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), t = table_(TAB.SESSIONS);
  if (!t) { install(); t = table_(TAB.SESSIONS); }
  var line = t.sheet.getLastRow() + 1;
  if (line > t.sheet.getMaxRows()) t.sheet.insertRowsAfter(t.sheet.getMaxRows(), 50);
  setCell_(t, line, "status", S_OPEN);
  setCell_(t, line, "language", "Français");
  setCell_(t, line, "published", false);
  ss.setActiveSheet(t.sheet);
  t.sheet.getRange(line, (t.col.training || 0) + 1).activate();
  ss.toast("Choisissez la formation, la date, les heures, le lieu et le nombre de places. Cochez « Publiée sur le site » quand tout est prêt, puis menu › Publier sur le site.", "Nouvelle session", 15);
}

function setSessionStatus_(status, message) {
  var sel = selectedSession_();
  if (!sel) return;
  setCell_(sel.sessions.t, sel.s.line, "status", status);
  refreshAll_(); clearCache_();
  SpreadsheetApp.getActiveSpreadsheet().toast(message, sel.s.trainingName + " · " + whenText_(sel.s), 8);
}
function closeRegistrations() { setSessionStatus_(S_CLOSED, "Inscriptions fermées : la session reste visible, sans bouton de réservation."); }
function reopenRegistrations() { setSessionStatus_(S_OPEN, "Inscriptions rouvertes (dans la limite des places restantes)."); }

function activeBookingsOf_(sessionId, rows, now) {
  var byRef = {};
  rows.forEach(function (b) { if (b.session === sessionId && holdsSeats_(b, now) && !byRef[b.ref]) byRef[b.ref] = b; });
  return Object.keys(byRef).map(function (k) { return byRef[k]; });
}

function cancelSession() {
  var sel = selectedSession_();
  if (!sel) return;
  var ui = ui_(), s = sel.s, now = now_(), refunds = [];
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { ui.alert("Une réservation est en cours d'enregistrement : réessayez dans quelques secondes."); return; }
  var active;
  try {
    var b = readBookings_();
    active = activeBookingsOf_(s.id, b.rows, now);
    var answer = ui.alert("Annuler la session " + s.trainingName + " du " + whenText_(s) + " ?", active.length + " réservation(s) active(s). Elles passeront au statut « Annulée » et chaque client recevra un e-mail dans sa langue. Les paiements en ligne seront marqués « Remboursement à faire ». Continuer ?", ui.ButtonSet.YES_NO);
    if (answer !== ui.Button.YES) return;
    setCell_(sel.sessions.t, s.line, "status", S_CANCELLED);
    b.rows.forEach(function (r) {
      if (r.session !== s.id || !holdsSeats_(r, now)) return;
      setCell_(b.t, r.line, "status", B_CANCELLED); setCell_(b.t, r.line, "cancelled", now);
      if (r.payStatus === P_PAID) { setCell_(b.t, r.line, "pay_status", P_REFUND); refunds.push(r.ref + " — " + (r.amountIncl || 0) + " € (" + r.mollieId + ")"); }
    });
    active.forEach(function (r) {
      var lang = r.lang, paid = r.payStatus === P_PAID;
      var inner = "<p>" + esc_(tr_(lang, "email.hello_anon")) + "</p><p>" + esc_(tr_(lang, "email.session_cancelled_body", { training: trainingName_(s.training, lang, s.trainingName), date: longDate_(s.date, lang), ref: r.ref })) + "</p>" +
        (paid ? "<p>" + esc_(tr_(lang, "email.refund_note")) + "</p>" : "") + "<p>" + esc_(tr_(lang, "email.session_cancelled_next")) + "</p>";
      queueClient_("Session annulée", "P1", r.email, lang, tr_(lang, "email.session_cancelled_subject", { ref: r.ref }), tr_(lang, "email.session_cancelled_title"), inner, r.ref,
        { href: CONFIG.SITE_URL + tr_(lang, "email.agenda_path"), label: tr_(lang, "email.cta_agenda") });
    });
    if (refunds.length) queueTeamAlert_("Remboursements à faire (session annulée)", "<p>Session « " + esc_(s.trainingName) + " » du " + esc_(whenText_(s)) + " annulée. Remboursez ces paiements depuis le tableau de bord Mollie :</p><ul><li>" + refunds.map(esc_).join("</li><li>") + "</li></ul>", s.id);
    log_("Session", s.id, "Info", "Session annulée (" + active.length + " réservation(s) annulée(s), " + refunds.length + " remboursement(s) à faire).");
    refreshAll_(); SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  clearCache_();
  processOutbox_(20);
  ui.alert("Session annulée. " + active.length + " e-mail(s) d'annulation préparé(s)." + (refunds.length ? " " + refunds.length + " remboursement(s) à faire dans Mollie (e-mail envoyé à l'équipe)." : "") + " Pensez à « Publier sur le site ».");
}

function notifyScheduleChange() {
  var sel = selectedSession_();
  if (!sel) return;
  var ui = ui_(), s = sel.s, active = activeBookingsOf_(s.id, readBookings_().rows, now_());
  if (!active.length) { ui.alert("Aucune réservation active pour cette session."); return; }
  var answer = ui.alert("Prévenir " + active.length + " client(s) ?", "Un e-mail annonce l'horaire actuel de la feuille : " + whenText_(s) + ". Continuer ?", ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) return;
  active.forEach(function (r) {
    var lang = r.lang;
    var inner = "<p>" + esc_(tr_(lang, "email.hello_anon")) + "</p><p>" + esc_(tr_(lang, "email.schedule_body", { training: trainingName_(s.training, lang, s.trainingName), ref: r.ref })) + "</p>" + sessionLine_(s, lang) + "<p>" + esc_(tr_(lang, "email.schedule_reply")) + "</p>";
    queueClient_("Changement d'horaire", "P1", r.email, lang, tr_(lang, "email.schedule_subject", { ref: r.ref }), tr_(lang, "email.schedule_title"), inner, r.ref);
  });
  processOutbox_(20);
  ui.alert(active.length + " e-mail(s) préparé(s) (voir l'onglet « " + TAB.OUTBOX + " »).");
}

function participantsList() {
  var sel = selectedSession_();
  if (!sel) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet(), s = sel.s, now = now_(), b = readBookings_(), people = table_(TAB.PEOPLE);
  var name = ("Liste " + s.id).slice(0, 90), old = ss.getSheetByName(name);
  if (old) ss.deleteSheet(old);
  var sh = ss.insertSheet(name);
  var rows = [[s.trainingName + " — " + whenText_(s) + " — " + labelOf_(LOCATIONS, s.location), "", "", "", "", "", ""],
    ["Places réservées : " + (taken_(b.rows, now)[s.id] || 0) + " / " + s.capacity + " · liste créée le " + fmt_(now, "dd/MM/yyyy HH:mm"), "", "", "", "", "", ""],
    ["", "", "", "", "", "", ""],
    ["Référence", "Statut", "Société", "Contact", "E-mail", "Téléphone", "Places / participants"]];
  b.rows.forEach(function (r) {
    if (r.session !== s.id || !holdsSeats_(r, now)) return;
    rows.push([r.ref, r.statusRaw + (r.payStatus ? " · " + r.payStatus : ""), r.company, r.contact, r.email, r.phone, r.seats + " — " + r.participants]);
  });
  rows.push(["", "", "", "", "", "", ""], ["Participants nommés", "", "", "", "", "", ""], ["Référence", "Prénom", "Nom", "E-mail", "Présence", "Résultat", "Signature"]);
  if (people) {
    var active = {};
    b.rows.forEach(function (r) { if (r.session === s.id && holdsSeats_(r, now)) active[r.ref] = true; });
    for (var i = 1; i < people.values.length; i++) {
      var p = people.values[i];
      if (clean_(get_(people, p, "session")) !== s.id || !active[clean_(get_(people, p, "ref"))]) continue;
      rows.push([clean_(get_(people, p, "ref")), clean_(get_(people, p, "first")), clean_(get_(people, p, "last")), clean_(get_(people, p, "email")), "", "", ""]);
    }
  }
  sh.getRange(1, 1, rows.length, 7).setValues(rows.map(function (r) { return r.map(function (v) { return typeof v === "string" ? asText_(v) : v; }); }));
  sh.getRange(1, 1).setFontSize(14).setFontWeight("bold");
  sh.getRange(4, 1, 1, 7).setFontWeight("bold").setBackground("#0D4A8C").setFontColor("#FFFFFF");
  [130, 170, 180, 180, 220, 130, 320].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  ss.setActiveSheet(sh);
  ss.toast("Pour l'enregistrer : Fichier › Télécharger › PDF ou Excel. Vous pouvez supprimer cet onglet ensuite.", "Liste des participants", 12);
}

function selectedBookings_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getName() !== TAB.BOOKINGS) { ui_().alert("Cliquez d'abord sur la ligne de la réservation, dans l'onglet « " + TAB.BOOKINGS + " »."); return null; }
  var lines = {};
  sheet.getActiveRangeList().getRanges().forEach(function (rg) { for (var l = rg.getRow(); l < rg.getRow() + rg.getNumRows(); l++) if (l > 1) lines[l] = true; });
  var b = readBookings_(), rows = b.rows.filter(function (r) { return lines[r.line]; });
  if (!rows.length) { ui_().alert("Aucune réservation sélectionnée."); return null; }
  return { b: b, rows: rows };
}

function cancelSelectedBooking() {
  var ui = ui_(), sel = selectedBookings_();
  if (!sel) return;
  var now = now_(), targets = sel.rows.filter(function (r) { return r.status !== "cancelled"; });
  if (!targets.length) { ui.alert("Ces lignes sont déjà annulées."); return; }
  var answer = ui.alert("Annuler " + targets.length + " ligne(s) de réservation ?", targets.map(function (r) { return r.ref + " — " + r.training + " (" + r.seats + " place(s))" + (r.payStatus === P_PAID ? " — PAYÉE en ligne" : ""); }).join("\n") + "\n\nLes places seront libérées immédiatement.", ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) return;
  var mail = ui.alert("Prévenir le client par e-mail ?", "", ui.ButtonSet.YES_NO) === ui.Button.YES;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { ui.alert("Une réservation est en cours d'enregistrement : réessayez dans quelques secondes."); return; }
  var refunds = [];
  try {
    targets.forEach(function (r) {
      setCell_(sel.b.t, r.line, "status", B_CANCELLED); setCell_(sel.b.t, r.line, "cancelled", now);
      if (r.payStatus === P_PAID) { setCell_(sel.b.t, r.line, "pay_status", P_REFUND); refunds.push(r.ref + " — " + (r.amountIncl || 0) + " € (" + r.mollieId + ")"); }
      log_("Réservation", r.ref, "Info", "Ligne annulée par l'équipe (" + r.training + ", " + r.seats + " place(s)).");
    });
    refreshAll_(); SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  clearCache_();
  if (refunds.length) queueTeamAlert_("Remboursements à faire", "<ul><li>" + refunds.map(esc_).join("</li><li>") + "</li></ul>", targets[0].ref);
  if (mail) {
    var done = {};
    targets.forEach(function (r) {
      if (done[r.ref] || !EMAIL_RE.test(r.email)) return;
      done[r.ref] = true;
      var lang = r.lang, inner = "<p>" + esc_(tr_(lang, "email.hello_anon")) + "</p><p>" + esc_(tr_(lang, "email.booking_cancelled_body", { ref: r.ref, training: r.training, when: r.when })) + "</p>" +
        (r.payStatus === P_PAID ? "<p>" + esc_(tr_(lang, "email.refund_note")) + "</p>" : "");
      queueClient_("Réservation annulée", "P1", r.email, lang, tr_(lang, "email.booking_cancelled_subject", { ref: r.ref }), tr_(lang, "email.booking_cancelled_title"), inner, r.ref);
    });
  }
  processOutbox_(20);
  ui.alert("Réservation annulée : places libérées." + (mail ? " E-mail préparé." : "") + (refunds.length ? " Remboursement à faire dans Mollie." : ""));
}

/** Paiement sur facture : l'équipe vérifie la société puis confirme ; e-mail au client dans sa langue. */
function confirmInvoiceBooking() {
  var ui = ui_(), sel = selectedBookings_();
  if (!sel) return;
  var now = now_(), targets = sel.rows.filter(function (r) { return r.status === "pending_invoice" || (r.status === "expired" && r.payMode === M_INVOICE); });
  if (!targets.length) { ui.alert("Sélectionnez une ligne « " + B_PENDING_INV + " »."); return; }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { ui.alert("Une réservation est en cours d'enregistrement : réessayez dans quelques secondes."); return; }
  var formations = readFormations_(), sessions = readSessions_(formations), problems = [], done = {};
  try {
    var others = sel.b.rows.filter(function (r) { return targets.indexOf(r) < 0; }), taken = taken_(others, now);
    targets.forEach(function (r) {
      var s = sessions.byId[r.session], left = s ? Math.max(0, s.capacity - (taken[s.id] || 0)) : 0;
      if (r.status === "expired" && left < r.seats) { problems.push(r.ref + " : plus assez de places (" + left + " restante(s))"); return; }
      setCell_(sel.b.t, r.line, "status", B_CONFIRMED); setCell_(sel.b.t, r.line, "expires", ""); setCell_(sel.b.t, r.line, "pay_status", P_INVOICE);
      taken[r.session] = (taken[r.session] || 0) + r.seats;
      done[r.ref] = done[r.ref] || [];
      done[r.ref].push(r);
    });
    refreshAll_(); SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  clearCache_();
  Object.keys(done).forEach(function (ref) {
    var rows = done[ref], lang = rows[0].lang;
    var inner = "<p>" + esc_(tr_(lang, "email.hello_anon")) + "</p><p>" + esc_(tr_(lang, "email.invoice_confirmed_body", { ref: ref })) + "</p>" +
      rows.map(function (r) { var s = sessions.byId[r.session]; return s ? sessionLine_(s, lang) + "<p>" + esc_(tr_(lang, "email.l_seats")) + " : " + r.seats + "</p>" : ""; }).join("");
    queueClient_("Confirmation (facture)", "P1", rows[0].email, lang, tr_(lang, "email.invoice_confirmed_subject", { ref: ref }), tr_(lang, "email.invoice_confirmed_title"), inner, ref,
      { href: CONFIG.SITE_URL + tr_(lang, "email.account_path"), label: tr_(lang, "email.cta_account") });
    log_("Réservation", ref, "Info", "Réservation sur facture confirmée par l'équipe.");
  });
  processOutbox_(20);
  ui.alert(Object.keys(done).length + " réservation(s) confirmée(s), e-mail préparé." + (problems.length ? "\n\nNon confirmées :\n" + problems.join("\n") : ""));
}

function syncNow() {
  tick();
  var q = quotaState_();
  SpreadsheetApp.getActiveSpreadsheet().toast("File d'envoi traitée. E-mails ce mois-ci : " + q.used + "/" + q.quota + ".", "Synchronisation", 8);
}

/** Déclenche la régénération du site (pages, données structurées Schema.org, fichier de secours). */
function publishSite() {
  var url = prop_("DEPLOY_HOOK_URL"), ui = ui_();
  if (!url || !/^https:\/\//.test(url)) { ui.alert("Le lien de publication n'est pas configuré (propriété du script DEPLOY_HOOK_URL, voir docs/SETUP.md). Les places et les dates sont de toute façon à jour en direct sur le site."); return; }
  var res = UrlFetchApp.fetch(url, { method: "post", muteHttpExceptions: true });
  var ok = res.getResponseCode() >= 200 && res.getResponseCode() < 300;
  log_("Publication", "", ok ? "Info" : "Erreur", "Régénération du site demandée (" + res.getResponseCode() + ").");
  ui.alert(ok ? "Publication lancée : le site sera régénéré dans quelques minutes (données structurées et fichier de secours). Les places, elles, sont déjà à jour en direct." : "La publication a échoué (" + res.getResponseCode() + "). Voir l'onglet Journal.");
}

function checkConsistency() {
  var problems = [], now = now_(), formations = readFormations_(), sessions = readSessions_(formations), bookings = readBookings_();
  var taken = taken_(bookings.rows, now);
  sessions.list.forEach(function (s) {
    if (!s.valid) problems.push("Sessions ligne " + s.line + " : " + s.problems.join(" ; ") + (s.published ? " — NON affichée sur le site." : "."));
    if (s.valid && taken[s.id] > s.capacity) problems.push("Sessions ligne " + s.line + " (" + s.id + ") : " + taken[s.id] + " places réservées pour " + s.capacity + " places au total.");
  });
  bookings.rows.forEach(function (b) {
    if (b.status === null) problems.push("Réservations ligne " + b.line + " : statut « " + b.statusRaw + " » incompris.");
    if (b.session && !sessions.byId[b.session]) problems.push("Réservations ligne " + b.line + " : session « " + b.session + " » introuvable.");
    if (!(b.seats >= 1)) problems.push("Réservations ligne " + b.line + " : nombre de places invalide.");
    if (b.payStatus === P_REFUND) problems.push("Réservations ligne " + b.line + " (" + b.ref + ") : remboursement Mollie à faire.");
  });
  var outbox = table_(TAB.OUTBOX);
  if (outbox) for (var r = 1; r < outbox.values.length; r++) {
    var st = clean_(get_(outbox, outbox.values[r], "status"));
    if (st === Q_FAILED) problems.push("File d'envoi ligne " + (r + 1) + " : e-mail non envoyé (" + clean_(get_(outbox, outbox.values[r], "error"), 120) + ").");
  }
  var q = quotaState_();
  if (q.state !== "ok") problems.push("Quota e-mails : " + q.used + "/" + q.quota + (q.state === "full" ? " — ATTEINT." : " — rappels suspendus."));
  if (!emailConfig_()) problems.push("EmailJS n'est pas configuré (propriétés du script EMAILJS_*).");
  if (!hmacSecret_()) problems.push("Secret de signature absent (propriété HMAC_SECRET) : le site ne peut pas parler à la feuille.");
  ui_().alert(problems.length ? "À corriger :\n\n" + problems.slice(0, 40).join("\n") : "Tout est cohérent : " + sessions.list.length + " session(s), " + bookings.rows.length + " ligne(s) de réservation. E-mails ce mois-ci : " + q.used + "/" + q.quota + ".");
}

function previewSite() {
  var out = publicSessions_(), formations = readFormations_();
  var LABEL = { open: "réservable", full: "COMPLÈTE", closed: "inscriptions fermées" };
  ui_().alert("Ce que le site affiche", out.sessions.length ? out.sessions.map(function (s) {
    return frDate_(s.date) + (s.startTime ? " " + s.startTime : "") + " — " + ((formations.byId[s.training] || {}).name || s.training) + " — " + labelOf_(LOCATIONS, s.location) + " — " + s.seatsLeft + " place(s) disponible(s) sur " + s.capacity + " — " + LABEL[s.status];
  }).join("\n") : "Aucune session publiée à venir.", ui_().ButtonSet.OK);
}

/** Lignes facturables d'une période (confirmées, payées en ligne ou sur facture) — pour le logiciel comptable. */
function accountingRows_(from, to) {
  var rows = [];
  readBookings_().rows.forEach(function (r) {
    if (r.status !== "confirmed" || !isDate_(r.received)) return;
    var d = fmt_(r.received, "yyyy-MM-dd");
    if (d < from || d > to) return;
    rows.push({ date: d, reference: r.ref, training: r.training, session: r.session, seats: r.seats, payMode: r.payMode, payStatus: r.payStatus,
      amountExcl: r.amountExcl, amountIncl: r.amountIncl, company: r.company, vat: r.vat, contact: r.contact, email: r.email });
  });
  return rows;
}
function accountingExportJson_(body) {
  var from = cellDate_(body.from), to = cellDate_(body.to);
  if (!from || !to) return { status: "invalid" };
  return { status: "ok", rows: accountingRows_(from, to) };
}
function accountingExport() {
  var now = now_(), y = +fmt_(now, "yyyy"), m = +fmt_(now, "MM") - 1;
  if (m === 0) { m = 12; y--; }
  var from = y + "-" + pad_(m) + "-01", to = addDays_(m === 12 ? (y + 1) + "-01-01" : y + "-" + pad_(m + 1) + "-01", -1);
  var rows = accountingRows_(from, to), ss = SpreadsheetApp.getActiveSpreadsheet(), name = "Export comptable " + y + "-" + pad_(m);
  var old = ss.getSheetByName(name);
  if (old) ss.deleteSheet(old);
  var sh = ss.insertSheet(name), head = ["Date", "Référence", "Formation", "Session", "Places", "Mode", "Paiement", "HTVA (€)", "TVAC (€)", "Société", "N° TVA", "Contact", "E-mail"];
  var data = [head].concat(rows.map(function (r) { return [r.date, r.reference, r.training, r.session, r.seats, r.payMode, r.payStatus, r.amountExcl, r.amountIncl, r.company, r.vat, r.contact, r.email].map(function (v) { return typeof v === "string" ? asText_(v) : v; }); }));
  sh.getRange(1, 1, data.length, head.length).setValues(data);
  sh.getRange(1, 1, 1, head.length).setFontWeight("bold").setBackground("#0D4A8C").setFontColor("#FFFFFF");
  ss.setActiveSheet(sh);
  ss.toast(rows.length + " ligne(s). Fichier › Télécharger › CSV pour l'importer dans le logiciel comptable (factures Peppol).", "Export comptable", 15);
}

function sendTestEmail() {
  var ui = ui_();
  try {
    var q = reserveQuota_("P1", 1, "Test");
    if (!q.allowed) { ui.alert("Quota mensuel atteint : aucun envoi possible (" + q.used + "/" + q.quota + ")."); return; }
    sendEmailJs_({ template: "equipe", reply: CONFIG.TEAM_EMAIL, subject: "[Site] E-mail de test (" + fmt_(now_(), "dd/MM/yyyy HH:mm") + ")",
      html: frame_("fr", "E-mail de test", "<p>Si vous lisez ce message dans la boîte " + esc_(CONFIG.TEAM_EMAIL) + ", les e-mails de la feuille partent bien par EmailJS.</p>"), text: "E-mail de test du Centre CFS." });
    ui.alert("E-mail de test envoyé à " + CONFIG.TEAM_EMAIL + ". S'il n'arrive pas dans les 5 minutes, regardez dans les indésirables puis dans l'onglet « " + TAB.LOG + " ».");
  } catch (err) {
    ui.alert("L'envoi a échoué : " + String(err && err.message || err).slice(0, 400));
  }
}

/* ======================================================================= installation / mise en forme */

function setupTab_(ss, name) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name), cols = COLS[name];
  var header = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  if (header.every(function (h) { return String(h).trim() === ""; })) {
    sheet.getRange(1, 1, 1, cols.length).setValues([cols.map(function (c) { return c[1]; })]);
  } else {
    var have = {}, next = sheet.getLastColumn() + 1;
    header.forEach(function (h) { have[normalizeHeader_(h)] = true; });
    cols.forEach(function (c) { if (!have[normalizeHeader_(c[1])]) sheet.getRange(1, next++).setValue(c[1]); });
  }
  var t = table_(name);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, t.width).setFontWeight("bold").setFontColor("#FFFFFF").setBackground("#0D4A8C").setVerticalAlignment("middle").setWrap(true);
  cols.forEach(function (c) {
    var i = t.col[c[0]];
    if (i === undefined) return;
    sheet.setColumnWidth(i + 1, c[3]);
    if (c[2]) sheet.getRange(1, i + 1).setNote(c[2]);
    if (c[4]) sheet.hideColumns(i + 1);
  });
  return t;
}
function setupTabs_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  [TAB.FORMATIONS, TAB.SESSIONS, TAB.BOOKINGS, TAB.PEOPLE, TAB.REQUESTS, TAB.PAYMENTS, TAB.PROFILES, TAB.OUTBOX, TAB.LOG].forEach(function (n) { setupTab_(ss, n); });
}

/** Installer / réparer la feuille : idempotent, ne supprime JAMAIS rien. */
function install() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try { ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE); } catch (e) { /* déjà réglé */ }
  try { ss.setSpreadsheetLocale(CONFIG.LOCALE); } catch (e) { /* déjà réglé */ }
  if (/^(Feuille de calcul sans titre|Untitled spreadsheet)$/.test(ss.getName())) ss.rename(CONFIG.FILE_NAME);
  setupTabs_();

  var ft = table_(TAB.FORMATIONS), known = {};
  for (var r = 1; r < ft.values.length; r++) known[clean_(get_(ft, ft.values[r], "id")).toLowerCase()] = true;
  appendRows_(ft, FORMATIONS.filter(function (f) { return !known[f[0]]; }).map(function (f) {
    return rowFor_(ft, { id: f[0], name: f[1], domain: f[2], price: f[3] == null ? "" : f[3], duration: f[4] || "", capacity: f[5] == null ? "" : f[5],
      bookable: f[6] !== false, page: CONFIG.SITE_URL + "/formations/" + f[0] + "/" });
  }));
  var fRows = Math.max(ft.sheet.getLastRow() - 1, 1);
  if (ft.col.bookable !== undefined) ft.sheet.getRange(2, ft.col.bookable + 1, fRows, 1).insertCheckboxes();
  if (ft.col.price !== undefined) ft.sheet.getRange(2, ft.col.price + 1, fRows, 1).setNumberFormat("#,##0.00 €");

  var st = table_(TAB.SESSIONS), sh = st.sheet, rows = Math.max(1, sh.getMaxRows() - 1);
  var c = st.col, range = function (f) { return sh.getRange(2, c[f] + 1, rows, 1); };
  range("start").setNumberFormat("@"); range("end").setNumberFormat("@");
  if (st.values.length < 2 || st.values.slice(1).every(emptyRow_)) {
    var today = fmt_(now_(), "yyyy-MM-dd"), fById = {};
    FORMATIONS.forEach(function (f) { fById[f[0]] = f; });
    appendRows_(st, SEED_SESSIONS.filter(function (s) { return s.date >= today && fById[s.training]; }).map(function (s) {
      var cap = s.capacity || fById[s.training][5] || "";
      return rowFor_(st, { id: s.date + "-" + s.training + "-" + s.location, training: fById[s.training][1], date: at_(s.date, "12:00"),
        end_date: s.endDate ? at_(s.endDate, "12:00") : "", start: s.start || "", end: s.end || "", location: labelOf_(LOCATIONS, s.location),
        language: labelOf_(LANGUAGES, s.language || "fr"), capacity: cap, status: S_OPEN, published: !!cap && s.published !== false });
    }));
  }
  var names = readFormations_().list.map(function (f) { return f.name; });
  range("training").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(names, true).setAllowInvalid(false).build());
  range("date").setNumberFormat("dd/mm/yyyy").setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  range("end_date").setNumberFormat("dd/mm/yyyy");
  range("location").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(LOCATIONS.map(function (l) { return l[1]; }), true).setAllowInvalid(false).build());
  range("language").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(LANGUAGES.map(function (l) { return l[1]; }), true).setAllowInvalid(true).build());
  range("capacity").setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(1, 500).setAllowInvalid(false).build());
  range("booked").setFontColor("#4A5869").setBackground("#F2F5F9");
  range("remaining").setFontWeight("bold").setBackground("#F2F5F9");
  range("status").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(SESSION_STATUSES, true).setAllowInvalid(false).build());
  range("closes").setNumberFormat("dd/mm/yyyy hh:mm");
  range("published").insertCheckboxes();
  var byText = function (text, bg, fg, rg) { return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(text).setBackground(bg).setFontColor(fg).setRanges([rg]).build(); };
  sh.setConditionalFormatRules([
    byText(S_OPEN, "#E2F4EB", "#0B7F4E", range("status")), byText(S_CLOSED, "#FFF6DB", "#6B4E00", range("status")), byText(S_CANCELLED, "#ECEFF3", "#4A5869", range("status")),
    SpreadsheetApp.newConditionalFormatRule().whenNumberEqualTo(0).setBackground("#FCE8E7").setFontColor("#C8241C").setRanges([range("remaining")]).build()
  ]);
  ["id", "booked", "remaining"].forEach(function (f) {
    sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) { if (p.getDescription() === "Calculé : " + f) p.remove(); });
    sh.getRange(2, c[f] + 1, rows, 1).protect().setDescription("Calculé : " + f).setWarningOnly(true);
  });
  [TAB.BOOKINGS, TAB.PEOPLE, TAB.PAYMENTS, TAB.PROFILES, TAB.OUTBOX, TAB.LOG].forEach(function (n) {
    var sheet = ss.getSheetByName(n);
    sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { p.remove(); });
    sheet.protect().setDescription(n === TAB.BOOKINGS ? "Ne supprimez jamais une ligne : utilisez le menu Centre CFS (annuler, confirmer)." : "Écrit par le script Centre CFS.").setWarningOnly(true);
  });
  var bt = table_(TAB.BOOKINGS), bRows = Math.max(1, bt.sheet.getMaxRows() - 1);
  var stRange = bt.sheet.getRange(2, bt.col.status + 1, bRows, 1);
  stRange.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(BOOKING_STATUSES, true).setAllowInvalid(false).build());
  bt.sheet.getRange(2, bt.col.pay_status + 1, bRows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(PAY_STATUSES, true).setAllowInvalid(true).build());
  ["received", "expires", "cancelled"].forEach(function (f) { bt.sheet.getRange(2, bt.col[f] + 1, bRows, 1).setNumberFormat("dd/mm/yyyy hh:mm"); });
  bt.sheet.setConditionalFormatRules([
    byText(B_CONFIRMED, "#E2F4EB", "#0B7F4E", stRange), byText(B_PENDING_PAY, "#FFF6DB", "#6B4E00", stRange), byText(B_PENDING_INV, "#E7EFF8", "#0D4A8C", stRange),
    byText(B_CANCELLED, "#ECEFF3", "#4A5869", stRange), byText(B_EXPIRED, "#ECEFF3", "#4A5869", stRange)
  ]);
  var rq = table_(TAB.REQUESTS), rRows = Math.max(1, rq.sheet.getMaxRows() - 1);
  rq.sheet.getRange(2, rq.col.status + 1, rRows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(REQUEST_STATUSES, true).setAllowInvalid(true).build());
  rq.sheet.getRange(2, rq.col.received + 1, rRows, 1).setNumberFormat("dd/mm/yyyy hh:mm");
  ss.setActiveSheet(sh);

  ScriptApp.getProjectTriggers().forEach(function (tr) { if (tr.getHandlerFunction() === "tick") ScriptApp.deleteTrigger(tr); });
  ScriptApp.newTrigger("tick").timeBased().everyMinutes(10).create();

  completeSessionIds_();
  refreshAll_();
  clearCache_();
  var missing = [];
  if (!hmacSecret_()) missing.push("HMAC_SECRET");
  if (!emailConfig_()) missing.push("EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_CLIENT, EMAILJS_TEMPLATE_EQUIPE, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY");
  var done = "Feuille prête ✔\n\n• Formations : " + readFormations_().list.length + ".\n• Sessions : une ligne = une session ; les places restantes sont calculées automatiquement.\n• Tâche automatique : toutes les 10 minutes." +
    (missing.length ? "\n\n⚠ À compléter dans Paramètres du projet › Propriétés du script : " + missing.join(", ") + "." : "") +
    "\n\nÉtape suivante : Déployer › Nouveau déploiement › Application Web (voir docs/SETUP.md).";
  try { ui_().alert(done); } catch (e) { try { ss.toast("Feuille prête ✔ — voir docs/SETUP.md", "Centre CFS", 10); } catch (e2) { /* lancé depuis l'éditeur */ } }
}
