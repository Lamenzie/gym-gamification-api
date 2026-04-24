const db = require("../config/db"); // Ujisti se, že cesta k db.js je správná podle tvé struktury

// --- POMOCNÁ FUNKCE: GACHA GENERÁTOR ---
const generateNewShop = async () => {
    const itemsRes = await db.query('SELECT * FROM "Equipment"');
    const items = itemsRes.rows;
    
    const pickItem = () => {
        const rand = Math.random() * 100;
        let targetRarity = 'COMMON';
        if (rand < 3) targetRarity = 'LEGENDARY'; // 3% šance
        else if (rand < 15) targetRarity = 'EPIC'; // 12% šance
        else if (rand < 45) targetRarity = 'RARE'; // 30% šance
        
        const filtered = items.filter(i => i.Rarity === targetRarity);
        if (filtered.length === 0) return items[Math.floor(Math.random() * items.length)].Id;
        return filtered[Math.floor(Math.random() * filtered.length)].Id;
    };

    return [pickItem(), pickItem(), pickItem()];
};

// --- 1. NAČTENÍ OBCHODU ---
exports.getEquipmentShop = async (req, res) => {
    const userId = req.user.id;
    try {
        let shopRes = await db.query('SELECT * FROM "UserShop" WHERE "UserId" = $1', [userId]);
        let needsNewShop = false;

        if (shopRes.rows.length === 0) {
            needsNewShop = true;
        } else {
            const restockTime = new Date(shopRes.rows[0].NextRestockAt).getTime();
            if (Date.now() >= restockTime) needsNewShop = true;
        }

        if (needsNewShop) {
            const [item1, item2, item3] = await generateNewShop();
            await db.query(`
                INSERT INTO "UserShop" ("UserId", "Slot1Id", "Slot2Id", "Slot3Id", "NextRestockAt") 
                VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 minute')
                ON CONFLICT ("UserId") 
                DO UPDATE SET "Slot1Id" = $2, "Slot2Id" = $3, "Slot3Id" = $4, "NextRestockAt" = NOW() + INTERVAL '1 minute'
            `, [userId, item1, item2, item3]);
            
            shopRes = await db.query('SELECT * FROM "UserShop" WHERE "UserId" = $1', [userId]);
        }

        const shopData = shopRes.rows[0];
        const itemsDetailRes = await db.query(`
            SELECT e.*, 
            CASE WHEN ui."Id" IS NOT NULL THEN true ELSE false END as "IsOwned"
            FROM "Equipment" e
            LEFT JOIN "UserInventory" ui ON e."Id" = ui."EquipmentId" AND ui."UserId" = $1
            WHERE e."Id" IN ($2, $3, $4)
        `, [userId, shopData.Slot1Id, shopData.Slot2Id, shopData.Slot3Id]);

        res.status(200).json({ 
            restockAt: shopData.NextRestockAt, 
            items: itemsDetailRes.rows 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Chyba při načítání obchodu.' });
    }
};

// --- 2. PLACENÝ REROLL ---
exports.rerollShop = async (req, res) => {
    const userId = req.user.id;
    const REROLL_COST = 150; 

    try {
        await db.query('BEGIN');

        const userRes = await db.query('SELECT "Coins" FROM "UserProgress" WHERE "UserId" = $1', [userId]);
        if (userRes.rows[0].Coins < REROLL_COST) {
            await db.query('ROLLBACK');
            return res.status(400).json({ error: 'Nemáš dost zlaťáků na Reroll!' });
        }

        await db.query('UPDATE "UserProgress" SET "Coins" = "Coins" - $1 WHERE "UserId" = $2', [REROLL_COST, userId]);

        const [item1, item2, item3] = await generateNewShop();
        
        await db.query(`
            UPDATE "UserShop" 
            SET "Slot1Id" = $1, "Slot2Id" = $2, "Slot3Id" = $3, "NextRestockAt" = NOW() + INTERVAL '1 minute'
            WHERE "UserId" = $4
        `, [item1, item2, item3, userId]);

        await db.query('COMMIT');
        res.status(200).json({ message: 'Obchod byl obnoven!' });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Chyba při Rerollu.' });
    }
};

// --- 3. NÁKUP PŘEDMĚTU ---
exports.buyEquipment = async (req, res) => {
    const userId = req.user.id;
    const { equipmentId } = req.params;

    try {
        await db.query('BEGIN');

        const equipRes = await db.query('SELECT "Price" FROM "Equipment" WHERE "Id" = $1', [equipmentId]);
        if (equipRes.rows.length === 0) throw new Error('Předmět neexistuje.');
        const price = equipRes.rows[0].Price;

        const userRes = await db.query('SELECT "Coins" FROM "UserProgress" WHERE "UserId" = $1', [userId]);
        if (userRes.rows[0].Coins < price) {
            await db.query('ROLLBACK');
            return res.status(400).json({ error: 'Nemáš dost zlaťáků!' });
        }

        const inventoryCheck = await db.query('SELECT "Id" FROM "UserInventory" WHERE "UserId" = $1 AND "EquipmentId" = $2', [userId, equipmentId]);
        if (inventoryCheck.rows.length > 0) {
            await db.query('ROLLBACK');
            return res.status(400).json({ error: 'Tento předmět již vlastníš!' });
        }

        await db.query('UPDATE "UserProgress" SET "Coins" = "Coins" - $1 WHERE "UserId" = $2', [price, userId]);
        await db.query('INSERT INTO "UserInventory" ("UserId", "EquipmentId") VALUES ($1, $2)', [userId, equipmentId]);

        await db.query('COMMIT');
        res.status(200).json({ message: 'Předmět zakoupen!' });

    } catch (err) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: err.message || 'Chyba při nákupu.' });
    }
};