# Correction ciblée des trois Watches legacy Staging

Autorisation utilisateur : Microsoft, Limoges et Nice/Micromania uniquement ; SQL nécessaire et un déploiement Preview supplémentaire. Aucun changement de consentement, configuration de Watch, cron, horaire, modèle email, Production ou fonction Structured existante. Aucun email de test, événement hébergé artificiel, réinitialisation ou renvoi historique.

La migration ajoute six RPC internes, exclusivement exécutables par service_role. Elle fige les trois UUID existants du compte approuvé (Microsoft est résolu par son titre exact lors de l'application ; Limoges et Nice ont leurs UUID connus). Une base vide n'autorise aucun UUID ; l'application hébergée doit exiger exactement trois résultats avant de commencer. Aucun historique ni aucune ligne Watch/préférence n'est réécrit.

La complétion legacy existante continue de décider des identités nouvelles et des articles acceptés. L'adaptateur ajoute atomiquement ces seuls articles à l'outbox existante si la Watch autorisée est active, consentie et en daily_digest. Les contrôles manuels et le chemin horaire existant utilisent cet adaptateur. Les autres Watches legacy conservent leur comportement.

Le scope horaire appelle le nouveau runner borné aux trois Watches ; il n'envoie pas leurs digests. Le scope email du cron 08:15 appelle un processeur dédié à ces trois UUID en parallèle du processeur Structured inchangé. Le nouveau processeur réutilise la fenêtre Paris, les credentials/destinataire autorisés, le rendu, les membres, la clé d'idempotence et les frontières begin/finish existants. Les revendications SQL revérifient consentement, périmètre et limite d'une soumission par Watch/jour UTC ; une défaillance avant appel fournisseur libère seulement son propre claim. Après appel fournisseur, une réponse incertaine ne peut pas provoquer de renvoi automatique.

Vérification locale ciblée :

```
NODE_OPTIONS='--import=./server/test-support/no-external-network.mjs' node --no-maglev --test server/staging-legacy-notifications.test.js
```

Résultat : 6 tests réussis, zéro échec, aucun accès externe. Baselines silencieuses ; informations manuelles et automatiques conservées indépendamment pour les trois Watches ; quatrième Watch exclue ; contrôles ultérieurs/minuit sans perte ; cron horaire 08:00 sans envoi legacy ; sélection à 08:15 avec faux fournisseur ; panne Auth, reprise et réponse de complétion perdue sans doublon ; consentement OFF/immediate exclus ; mauvaises cibles et rôles non autorisés rejetés. Les empreintes des Watches avant/après migration et des fonctions Structured existantes sont identiques.

État à la préparation : SQL non appliquée, Preview supplémentaire non déployée. Le navigateur disponible demande une connexion GitHub/Supabase ; le CLI Supabase authentifié liste Staging mais sa requête SQL reste bloquée à l'initialisation du rôle. La recherche d'un autre emplacement d'identifiants a été refusée par le contrôle automatique et n'est pas poursuivie. Une reconnexion normale à Supabase permet de reprendre l'application autorisée, sans nouvelle autorisation de correction ni nouvel email.
