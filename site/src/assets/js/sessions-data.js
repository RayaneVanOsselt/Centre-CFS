/* =========================================================================
   Centre CFS — sessions de SECOURS (généré par site/tools/import_client.py depuis client/sessions.csv)
   Ne pas modifier à la main : modifier client/sessions.csv puis relancer `npm run import:client`.

   Utilisé seulement si la feuille de réservation ne répond pas (ou n'est pas encore branchée).
   Capacité seule, JAMAIS de places restantes : seules les places calculées par la feuille sont « en direct ».
   ========================================================================= */
(function (root) {
  "use strict";
  var data = { generatedAt: "2026-11-27", sessions: [
  {
    "id": "2026-12-10-vca-base-charleroi",
    "training": "vca-base",
    "date": "2026-12-10",
    "endDate": null,
    "startTime": "08:30",
    "endTime": "17:00",
    "location": "charleroi",
    "language": "fr",
    "capacity": null,
    "status": "open"
  },
  {
    "id": "2026-11-26-vca-ligne-hierarchique-engis",
    "training": "vca-ligne-hierarchique",
    "date": "2026-11-26",
    "endDate": "2026-11-27",
    "startTime": "08:30",
    "endTime": "17:00",
    "location": "engis",
    "language": "fr",
    "capacity": null,
    "status": "open"
  },
  {
    "id": "2026-12-10-vca-ligne-hierarchique-charleroi",
    "training": "vca-ligne-hierarchique",
    "date": "2026-12-10",
    "endDate": "2026-12-11",
    "startTime": "08:30",
    "endTime": "17:00",
    "location": "charleroi",
    "language": "fr",
    "capacity": null,
    "status": "open"
  },
  {
    "id": "2026-12-14-vca-ligne-hierarchique-engis",
    "training": "vca-ligne-hierarchique",
    "date": "2026-12-14",
    "endDate": "2026-12-15",
    "startTime": "08:30",
    "endTime": "17:00",
    "location": "engis",
    "language": "fr",
    "capacity": null,
    "status": "open"
  },
  {
    "id": "2026-12-07-ba4-engis",
    "training": "ba4",
    "date": "2026-12-07",
    "endDate": null,
    "startTime": "08:30",
    "endTime": "16:30",
    "location": "engis",
    "language": "fr",
    "capacity": null,
    "status": "open"
  },
  {
    "id": "2026-12-07-ba5-engis",
    "training": "ba5",
    "date": "2026-12-07",
    "endDate": null,
    "startTime": "08:30",
    "endTime": "16:30",
    "location": "engis",
    "language": "fr",
    "capacity": null,
    "status": "open"
  }
] };
  if (typeof module === "object" && module.exports) module.exports = data;
  root.CFS_SESSIONS_FALLBACK = data;
})(typeof self !== "undefined" ? self : this);
