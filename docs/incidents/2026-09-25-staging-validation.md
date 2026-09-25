# PR #28 — validation staging du 25 septembre 2026

## Résultat et limite de validation

Migration `20260925130000_media_conflict_no_transaction_retry` appliquée uniquement à `watch-assistant-staging` (`tseexvbwhrtofcsrvcqc`), le 25 septembre 2026 à **15:07:50.157562 UTC**. Une inscription dans le registre ; aucune session terminée, aucun redémarrage. Aucun accès au projet Production pendant cette étape. Aucun merge ni déploiement Production.

La validation est concluante pour la migration, l’intégrité, les lectures RLS réelles et les scénarios locaux de résilience. **Elle ne constitue pas une validation authentifiée de bout en bout de la Preview** : l’utilisateur a confirmé ne pas disposer de sessions staging existantes, et aucun OTP, compte ni token de connexion n’a été créé. La seule Watch staging est une média ; aucune entreprise réelle n’a été ajoutée pour compléter les fixtures.

## Références et isolation avant modification

Base et master distant : `eddf0b3b068ba9056095facb887745fe36764c91`. HEAD contrôlé : `49f3c89baa8bbfffda4570317a589a97435f9e0f`, PR ouverte en brouillon. Preview initiale : `dpl_BjW4ZYrXHzD9yJmhuW7fM9rNVxPB`, READY, même SHA, cible Preview. Les quatre worktrees ont été recensés ; les autres sont restés inchangés.

Les quatre overrides Supabase de la branche ont été relus : URLs et claims des clés anon correspondent à staging. Aucune variable service-role ni URL PostgreSQL supplémentaire n’est effective dans cette Preview. Les six bundles JavaScript réellement servis ont été téléchargés avec le cookie temporaire fourni par Vercel : seule référence trouvée, `tseexvbwhrtofcsrvcqc.supabase.co`, aucune référence Production. Le code serveur utilise la même URL staging ; aucune cible Production codée en dur. Aucune requête de test n’a été adressée à Production. La protection Vercel n’a pas été désactivée.

## Sauvegarde, exécution et comparaison

Relevés en transactions `READ ONLY`, exportés avant modification. [Preuves avant/après](2026-09-25-staging-evidence/) : définition exacte de la fonction, ACL, empreintes, migrations, politiques RLS, compteur/état et empreinte complète des lignes Watches, sessions avec PID/durée/état/requête expurgée. Les contenus de Watches et secrets ne sont pas inclus.

| Élément | Avant | Après |
|---|---|---|
| MD5 de `pg_get_functiondef` | `187ff83ffcbed58e401355dafe1f1486` | `c9dfbd9127b543e5bd33ce2764eacc1a` |
| Exceptions métier | Deux `40001` | Deux `PT409` |
| Migrations enregistrées | 7 | 8 ; sept anciennes empreintes identiques |
| Politiques publiques | 14 | 14, définitions identiques |
| RLS | Activé sur huit tables publiques | Identique |
| ACL de la fonction | postgres/authenticated | Identique |
| Watches | 1 média, monitoring/watching, révision 3 | Identique |
| MD5 des lignes Watches | `2d39d6458e072c68edf032f32241d92b` | Identique |
| Sessions bloquées/transactions abandonnées observées | 0 | 0 |

SHA-256 du fichier de migration : `9be243b7341c4e4d0c10e9a5a1b9bc50032c31b32b79a2a7264c80239b0e66e3`.

La première soumission a été rejetée avec une erreur de syntaxe 42601 : l’éditeur Monaco avait conservé un fragment de requête antérieure. Une lecture séparée a confirmé l’empreinte initiale et zéro inscription. Le texte complet a ensuite été remplacé, recopié et comparé avant exécution. La transaction réussie a terminé naturellement ; elle vérifiait l’empreinte préalable, l’absence de version enregistrée, `lock_timeout=3s` et `statement_timeout=15s`. Le registre a été renseigné dans la même transaction, avec définition et permissions appliquées. Aucune seconde application réussie ni interruption du traitement.

Les connexions anciennes avant migration étaient inactives, sans transaction ni bloqueur. Notamment, le listener PostgREST 14.5 attendait normalement `ClientRead`. **Aucun PID n’a été terminé.** L’absence de saturation est une observation sur cette fenêtre de validation, pas un test de charge.

## Résultats fonctionnels et performances

- Staging réel, SQL `READ ONLY` sous rôle authenticated et claims limités à la transaction : propriétaire = une média visible, zéro ligne étrangère ; autre portée = zéro ligne, liste vide réelle. Les lectures entreprise sont vides car aucune fixture entreprise n’est présente. Ces portées SQL ne sont pas des connexions applicatives.
- Data API staging anonyme : HTTP 401 / 42501 en 496 ms, aucune ligne exposée. APIs Preview sans session : company HTTP 401 `AUTH_REQUIRED` en 1 088 ms, media même résultat en 693 ms. Ce ne sont pas des mesures des listes authentifiées.
- Preview réelle : Home et All Watches chargées dans Chrome sans session, navigation visible, aucune erreur console observée sur ces pages.
- 24 scénarios navigateur synthétiques : Home/All Watches × FR/EN × normal, vide, 500, 503, malformation, cache avec panne. Corps et navigation présents ; messages traduits ; aucune panne présentée comme une liste vide confirmée. Shell mesuré à environ 1 ms avec réponses simulées à 50–56 ms.
- Timeouts EN Home et FR All Watches : interruption des requêtes à 8 002–8 005 ms ; corps et navigation visibles pendant l’attente, erreur explicite ensuite.
- Retry Sync : tests FR/EN de succès, échec et double activation, un POST pour les deux activations simultanées, pending conservé après échec et supprimé après confirmation. Vérification clavier navigateur : état occupé, bouton désactivé, échec visible puis focus restauré. Une lecture de récupération après un POST fait partie de la même tentative ; ce n’est pas un second POST.
- Watching conservé après erreurs ; fixture paused restant paused. Badge desktop 67,5 × 22 px ; alignement contrôlé en 1280 px et 390 px. Aucun fichier applicatif ni style supplémentaire modifié pendant cette étape.
- Une erreur de canal de message asynchrone a été observée pendant les navigations rapides des fixtures. Elle ressemble à un message d’extension navigateur, mais son origine n’a pas été établie ; aucun échec applicatif associé ni page blanche constaté. Elle n’est pas masquée dans le bilan.

Les succès/échecs d’écriture, conflits HTTP `40001`/`PT409`, changements de compte, logout, doubles appels, cache et rafales focus/online ont été vérifiés dans les tests locaux et PGlite. Aucune erreur 40001 n’a été injectée dans PostgREST staging pour éviter de recréer une boucle. Aucun contrôle de Watch réelle, mutation réelle, envoi, cron ou replay d’outbox.

## Tests exacts et changements de PR

Un preload de test bloque `fetch` externe et les connexions TCP hors loopback. Il a été activé pour les quatre exécutions ci-dessous, sans credentials staging/Production chargés dans les tests.

| Exécution | Résultat | Durée |
|---|---|---|
| Ciblés 1 | 73/73, zéro échec, sortie 0 | 2 797,171542 ms |
| Ciblés 2 | 73/73, zéro échec, sortie 0 | 2 742,242458 ms |
| `npm test` 1 | 1 057/1 057, zéro échec, sortie 0 | 6 065,007625 ms |
| `npm test` 2 | 1 057/1 057, zéro échec, sortie 0 | 5 913,928667 ms |

Commande ciblée :

```sh
NODE_OPTIONS='--import=./server/test-support/no-external-network.mjs' NODE_ENV=test node --no-maglev --test server/media-watch-conflict-response.test.js server/media-watch-persistence.test.js server/supabase-user.test.js src/js/watch-resilience.test.js src/js/editor-account-isolation.test.js src/js/home-inbox.test.js src/js/home-summary-navigation.test.js
```

Suites : `NODE_OPTIONS='--import=./server/test-support/no-external-network.mjs' npm test`. Build Vite en mode production local : réussi avec configuration Supabase staging ; warning Sass legacy existant. Syntaxe des nouveaux tests et du preload, whitespace et scan sensible : réussis. Aucun email, OTP ou notification réel envoyé par ces tests.

Ajouts limités à deux tests de mapping 40001/PT409, un test Retry Sync FR/EN, le preload sans réseau externe et la documentation/preuves. Aucun changement du comportement produit supplémentaire.

## Risques résiduels et plan Production — non autorisé

Restent à vérifier avec deux sessions staging existantes : parcours complet navigateur → API → Auth → RLS, mutations sur fixtures explicitement autorisées, vraie entreprise et véritable Watch paused. Les validations locales ne remplacent pas ces parcours. La migration est validée sur staging mais Production peut toujours avoir ses backends en boucle. Un timeout d’écriture ne prouve jamais l’absence de commit ; conserver mutations et révisions idempotentes. Sans Web Locks, la coordination entre onglets reste best effort. La reprise d’Elon Musk demeure hors périmètre.

1. **Sauvegarde préalable** : après nouvelle autorisation, revalider projet/SHA ; exporter en lecture seule migration history, fonction/ACL/RLS, empreintes de données et états, outbox et sessions. Vérifier sauvegarde restaurable avant intervention. Ne pas reprendre automatiquement les 185 anciens échecs.
2. **Migration** : appliquer uniquement PT409 avec préconditions, limites de temps et registre transactionnel ; comparer définition exacte, droits et historiques. Aucun changement de données ou d’état de Watch.
3. **Sessions bloquées** : réidentifier PID + backend_start + état + durée + requête + bloqueurs. Terminer uniquement les sessions confirmées en boucle, sous autorisation explicite ; jamais un PID historique non revalidé, jamais un listener inactif légitime. Aucun redémarrage global par défaut.
4. **Vérifications sans envoi** : comparer empreintes et compteurs ; mêmes statuts, Elon Musk toujours paused ; absence de 40001 en boucle et de PGRST003 ; aucun appel cron, contrôle réel, SMTP/Resend ou outbox.
5. **Smoke-tests** : après autorisation distincte de merge/déploiement, vérifier le SHA effectivement déployé et les lectures company/media avec session existante ; Home/All Watches/détail FR/EN, navigation/clavier/mobile, latence, fréquence des appels et conservation du cache en panne simulée sans mutation réelle.
6. **Rollback** : sous autorisation, revenir au déploiement applicatif précédent si régression ; conserver PT409, car revenir à 40001 réintroduirait la boucle. Aucun rollback de données nécessaire pour cette migration. Toute restauration SQL exceptionnelle doit être réévaluée, sauvegardée et approuvée séparément.

Arrêt après livraison de cette validation : aucune de ces opérations Production n’est autorisée par la présente étape.
