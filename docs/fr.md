# OpenWeather

Cette intégration fournit la météo affichée dans Gladys : le widget météo du
tableau de bord, et les réponses de l'assistant quand vous lui demandez « quel
temps fait-il ? ».

Une fois installée et configurée, elle prend le relais du service OpenWeather
intégré à Gladys, sans rien d'autre à faire. Si vous l'arrêtez ou la
désinstallez, Gladys revient automatiquement au service intégré.

## 1. Obtenir une clé d'API OpenWeather

1. Créez un compte gratuit sur
   [openweathermap.org](https://home.openweathermap.org/users/sign_up).
2. Ouvrez l'onglet [**API keys**](https://home.openweathermap.org/api_keys) de
   votre compte et copiez la clé (une chaîne de 32 caractères).
3. **Patientez** : une clé toute neuve met jusqu'à quelques heures avant d'être
   activée par OpenWeather. D'ici là, chaque requête répond `401`.

## 2. Configurer l'intégration

Ouvrez l'onglet **Configuration** de l'intégration et renseignez :

- **Clé d'API** — la clé que vous venez de copier. Elle est stockée comme un
  secret : Gladys ne la renvoie jamais au navigateur.
- **API OpenWeather** — quelle API appeler :
  - **Gratuite** (par défaut) : fonctionne avec n'importe quel compte.
    Conditions actuelles, 24 heures de prévisions par pas de 3 heures et
    5 jours.
  - **One Call 3.0** : nécessite l'abonnement « One Call by Call » sur votre
    compte OpenWeather (1000 appels par jour sont gratuits, mais une carte
    bancaire est demandée pour souscrire). Elle ajoute les prévisions réelles
    heure par heure, l'indice UV, le point de rosée et les **alertes météo
    nationales** (vigilance Météo-France, alertes NWS…), que l'API gratuite ne
    transporte pas.
- **Durée du cache** — pendant combien de temps une réponse est réutilisée
  avant de rappeler OpenWeather, en secondes (10 minutes par défaut). Cela
  permet de rester largement dans le quota gratuit. Mettez 0 si vous voulez que
  chaque rafraîchissement appelle l'API.

Enregistrez. Le statut en haut de la page passe au vert dès que l'intégration
peut fournir la météo.

## 3. Vérifier que ça marche

Le bouton **Tester la connexion** effectue une vraie requête vers OpenWeather
(Paris par défaut, changez les coordonnées pour les vôtres si vous le
souhaitez) et affiche la température, la condition et le nombre de jours de
prévisions obtenus. Il contourne le cache : il dit donc toujours la vérité sur
l'état réel de votre clé.

Ouvrez ensuite votre tableau de bord : le widget météo affiche la position
configurée dans votre maison Gladys.

## D'où vient la position

L'intégration ne stocke aucune position : c'est Gladys qui envoie les
coordonnées de la maison qui demande, ainsi que la langue et le système
d'unités (°C ou °F) de l'utilisateur qui demande. Changez l'adresse de votre
maison ou votre préférence d'unité dans Gladys, et cette intégration suit.

## En cas de problème

| Ce que vous voyez                                                            | Ce que ça veut dire                                                                                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| « OpenWeather rejected the API key (HTTP 401) »                              | La clé est erronée, ou elle n'est pas encore active (attendez jusqu'à quelques heures après sa création).                         |
| « OpenWeather does not serve /data/3.0/onecall for this account (HTTP 404) » | Vous avez choisi One Call 3.0 sans l'abonnement correspondant. Souscrivez sur le site d'OpenWeather, ou revenez à l'API gratuite. |
| « OpenWeather quota exceeded (HTTP 429) »                                    | Trop d'appels. Augmentez la durée du cache, ou changez d'offre OpenWeather.                                                       |
| Le widget affiche la météo mais aucune alerte                                | Les alertes météo n'existent que sur One Call 3.0, et uniquement là où un service météorologique en a émis une.                   |

L'intégration journalise chaque requête qu'elle effectue : consultez les logs de
l'intégration depuis l'interface de Gladys (ou `docker logs` sur l'hôte).
Passez `LOG_LEVEL=debug` pour le détail complet, URLs appelées comprises (la clé
d'API n'est jamais journalisée).
