# Incident Watches — 25 septembre 2026

## Périmètre et état de livraison

Base exacte : `eddf0b3b068ba9056095facb887745fe36764c91` (master). Branche : `codex/watch-resilience-incident-20260925`. Production auditée : `dpl_Gtn5m8ZhCbMYuFoNpubV5s6xkgHq`, READY, même SHA. Aucun merge, déploiement Production, migration appliquée, modification de ligne, changement de statut, OTP, envoi d’e-mail, exécution de cron, redémarrage ou replay d’outbox pendant cette intervention. Les manipulations de Watches utilisées pour les tests sont exclusivement synthétiques, en mémoire ou dans PGlite.

La migration livrée est indispensable au correctif serveur. La seule publication du JavaScript ne répare pas les backends PostgREST déjà bloqués. L’incident Production n’est donc pas déclaré résolu par cette PR.

## Audit en lecture seule

Les requêtes SQL de diagnostic ont été exécutées dans des transactions `BEGIN READ ONLY … COMMIT`. Les observations ci-dessous sont datées du 25 septembre, heures UTC.

- Vercel : GET media 200 à 12:05:05, POST media 503 à 12:05:07, puis GET company 500 avec `DATABASE_ERROR` et GET/POST media 503 répétés. L’authentification company réussit avant l’échec de liste. Exemple de corrélation : requête `58f809f9-6c60-4e45-823d-54979cdedc12`, 12:18:40.
- Supabase : projet affiché Healthy, mais Data API à 100 % d’échecs dans sa fenêtre courante ; environ 100 000 erreurs PostgreSQL dans l’heure. Les logs Data API montrent `PGRST003: Timed out acquiring connection from connection pool`, HTTP 504, sur les listes company/media et sur `rpc/persist_media_watch`.
- PostgreSQL : `40001 Media conflict` en boucle dans `persist_media_watch`, PostgREST 14.5. À 12:20:38, une session ouverte à 12:04:49 atteint la ligne de log 110600. À 12:22:39, dix connexions authenticator sont occupées par cette RPC ou ses verrous, avec des transactions avortées.
- Le code SQL utilisait `40001` pour des conflits métier de révision/suppression. Ce code signifie serialization failure et déclenche les retries de PostgREST. Le serveur Node attend une réponse terminale qui ne revient pas normalement ; les listes indépendantes sont touchées par la saturation du même pool.

Ce mécanisme est documenté par Supabase : [High CPU and infinite transaction retries when using custom error codes in RPC functions](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b). Le correctif utilise `PT409`, conserve HTTP 409 et ne change pas les règles de concurrence.

## Intégrité et pause

Sept lignes présentes : six non supprimées sur deux comptes. Le compte affecté contient cinq Watches actives dans le sens « non supprimées » : trois company, Bitcoin et Elon Musk. Le second compte contient une company. La seule suppression logique observée concerne une ancienne CEMEX, datée du 30 août, antérieure à cet incident. Les six lignes non supprimées sont présentes à l’instant de l’audit ; ceci ne prouve pas l’absence historique de toute suppression physique.

Elon Musk : `monitoring_state=paused`, `current_status=paused`, révision 6, `deleted_at=NULL`, dernière modification à 10:14:21.569202. C’est un état serveur réel. Cette date ne prouve ni l’heure exacte de la transition ni son auteur. Bitcoin reste `monitoring/watching`, révision 5. Aucun de ces états n’a été modifié.

Le code antérieur transformait une erreur de validation lors d’une édition media en mutation de pause marquée `localOnly`. Ce chemin constitue une cause possible, mais les traces disponibles ne permettent pas de l’attribuer à la pause d’Elon Musk. Le journal local pending de la session Production n’a pas été extrait ; son contenu reste inconnu. Aucun replay ni reprise automatique n’est effectué.

## Changements

- Migration additive remplaçant uniquement les deux exceptions `40001` de la RPC par `PT409`, avec les signatures et permissions existantes. Le handler accepte les deux codes pendant la transition.
- Budget serveur commun de six secondes pour Auth et les accès Supabase ; indisponibilité Auth temporaire renvoyée en 503, sans la confondre avec une session invalide. Diagnostics limités aux codes, méthode, statut et durée, sans contenu de Watch ni token.
- Requêtes client bornées à huit secondes, déduplication des requêtes en vol, verrou entre onglets lorsqu’il est disponible, délai partagé de 15 secondes après succès et backoff de 30 secondes à cinq minutes après échec. Aucun timer de retry ni boucle récursive. Les actions explicites permettent une nouvelle tentative.
- Snapshots validés séparément par compte ; conservation de la dernière liste connue en cas d’erreur, rejet des réponses tardives après changement de compte/déconnexion, distinction entre chargement, indisponibilité, copie ancienne et liste vide confirmée.
- Chargement company/media concurrent et initialisation immédiate de Home, All Watches et détail. L’éditeur attend encore les stores pour identifier correctement la Watch à éditer, avec les délais bornés.
- Synchronisation media : une seule écriture par mutation et par tentative, arrêt au premier échec, lecture de récupération, résultat explicite. Les mutations locales restent disponibles ; les anciens jobs de pause automatique `localOnly` sont mis en quarantaine. Une erreur de validation ne produit plus de pause.
- Notices FR/EN accessibles, boutons de reprise protégés contre les doubles activations, retour d’échec visible, focus clavier restauré. Pas de compteurs zéro ni de « Watch introuvable » pendant un état incertain. Badge de statut compact dans la ligne de métadonnées du détail, aligné avec Modifier.

## Vérifications

Deux exécutions finales consécutives de `npm test` : **1054/1054**, zéro échec (6,47 s puis 4,25 s). La suite couvre les conflits SQL, la concurrence, l’isolation de compte, les réponses tardives, les listes vides confirmées, 500/503/timeout/réponse malformée, le maintien Watching/Paused, les modifications pending, les doubles soumissions et les rafales focus/online. Build réussi avec les quatre variables staging. Vérification syntaxique et `git diff --check` réussies ; audit du diff sensible réalisé avant commit. Les bundles contiennent la référence staging et aucune référence au projet Supabase Production.

Vérification navigateur des vrais composants avec transport intégralement simulé : Home et All Watches, FR/EN, 500, 503, malformation, vide confirmé, cache avec panne ; timeouts FR/EN ; détail et synchronisation échouée au clavier ; vues desktop 1280 et mobile 390. Navigation et corps de page présents ; copies conservées ; pause maintenue. Badge desktop mesuré 67,5 × 22 px. Le focus revient au bouton de synchronisation après échec. Aucune erreur console observée sur les scénarios inspectés.

Mesure contrôlée, non Production : avec 50 ms par réponse simulée et les stores réellement importés depuis le SHA de base, `initApp` attend 130 ms avant correctif ; avec le correctif, il peut démarrer après 1 ms, stores terminés à 53 ms. Dans le navigateur synthétique, shell 1–5 ms ; les requêtes suspendues sont interrompues autour de 8 002–8 008 ms sans bloquer la navigation. Ce n’est pas une mesure de guérison Production ni une mesure réseau réelle avant/après.

Reproduction locale : `node src/js/test-support/watch-resilience-preview.mjs`, puis `http://127.0.0.1:4189/watches.html?scenario=cached&lang=fr`. Scénarios : normal, empty, 500, 503, malformed, timeout, cached, sync-failure ; détail avec `id=00000000-0000-4000-8000-000000000001`, `paused=1` pour la pause. Ce serveur n’active pas les handlers API et ne possède aucune session réelle.

## Preview et risques résiduels

Quatre variables de branche exclusivement Preview (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) ciblent staging, projet `tseexvbwhrtofcsrvcqc`. Les valeurs ne sont pas dans Git. Un commit de bootstrap a temporairement désactivé le déploiement de cette branche pour installer les overrides avant tout build distant ; le fichier vercel.json final est identique à master.

La migration n’a pas été appliquée à staging non plus : les tests SQL sont locaux. Le parcours authentifié Preview avec une vraie session et la récupération effective du pool Production restent à valider, sans générer d’OTP. Un timeout d’écriture ne prouve pas l’absence de commit serveur ; l’identifiant de mutation et la révision rendent la nouvelle tentative idempotente. Sans Web Locks, la déduplication inter-onglets reste best effort. Un cache peut manquer (nouvel appareil, stockage bloqué) ou être ancien, ce qui est affiché explicitement. Les jobs localOnly historiques exigent une revue humaine avant toute reprise.

## Plan soumis à autorisation séparée

1. Revoir la PR et les résultats ; vérifier le SHA de master et les variables staging de la Preview. Valider la migration en staging avec autorisation explicite et une session existante, sans OTP/e-mail/cron.
2. Pour Production, obtenir une autorisation distincte couvrant migration, traitement des backends bloqués et merge/déploiement. Appliquer la migration ; identifier à nouveau les sessions réellement en boucle et examiner leurs transactions avant toute terminaison ciblée. Ne jamais réutiliser aveuglément un ancien PID. La documentation Supabase précise que les sessions déjà en boucle ne sont pas libérées par la seule modification de fonction. Aucun redémarrage global n’est proposé par défaut.
3. Déployer le SHA approuvé. Smoke en lecture seule avec session existante : company/media 200, six lignes toujours présentes, cinq pour le compte affecté, mêmes identifiants et états, Elon Musk toujours paused ; conflit contrôlé uniquement dans un environnement autorisé ; Home/All Watches/détail FR/EN et navigation mobile ; surveiller disparition de PGRST003 et de la boucle 40001, latence et fréquence des appels. Ne pas déclencher de cron ni de replay.
4. Rollback applicatif : revenir au précédent déploiement si régression, sous autorisation. Conserver le correctif SQL PT409 : réintroduire 40001 réintroduirait l’incident. Pas de rollback de données, aucune migration de données n’étant incluse. Toute reprise d’Elon Musk nécessite une demande distincte.
