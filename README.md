# Monster Gym - Backend API ⚔️🏋️‍♂️

Tento repozitář obsahuje serverovou část a API pro gamifikovanou fitness aplikaci, která propojuje reálný silový trénink s mechanismy RPG her (autobattler). Projekt vznikl jako praktická část bakalářské práce na Univerzitě Tomáše Bati ve Zlíně.

Backend zajišťuje veškerou herní logiku, validaci fyzických výkonů, přepočet zvednuté váhy na herní poškození, distribuci odměn a bezpečnou komunikaci s databází.

## 🛠 Použité technologie
* **Node.js & Express:** Hlavní běhové prostředí a framework pro tvorbu REST API.
* **Supabase (PostgreSQL):** Relační cloudová databáze s využitím Transaction Pooleru.
* **JSON Web Tokens (JWT):** Bezestavová autentizace a správa uživatelských relací.
* **Cors & Dotenv:** Správa křížových dotazů a bezpečná správa environmentálních proměnných.
* **Render.com:** Produkční hosting serveru.

## ⚙️ Hlavní funkce
* **Systém autentizace:** Bezpečné přihlašování a registrace s hashováním hesel.
* **Tréninkový kontroler (Workout Controller):** Matematický model pro výpočet damage, aplikace bonusů z vybavení a zlomkové přidělování zkušeností (XP) a zlaťáků (Coins).
* **Evoluce monster:** Automatizovaný systém tierování a generování nových protivníků.
* **Gacha Shop Generátor:** Pravděpodobnostní algoritmus pro rotaci herního vybavení v obchodě.
* **Anti-Cheat Logika:** Detekce a logování nerealistických fyzických výkonů.

## 🚀 Lokální spuštění projektu

1. **Klonování repozitáře:**
   ```bash
   git clone [https://github.com/TvojeJmeno/gym-backend.git](https://github.com/TvojeJmeno/gym-backend.git)
   cd gym-backend
   
2. Instalace závislostí:

    ```bash
    npm install


3. Nastavení proměnných prostředí:
Vytvořte soubor .env v kořenovém adresáři a doplňte potřebné přístupové klíče k Supabase a tajný klíč pro JWT (viz .env.example).

4. Spuštění serveru:

    ```bash
    # Pro vývoj (s nodemon)
    npm run dev
    
    # Pro produkci
    npm start
