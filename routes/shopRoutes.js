const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shopController');

const auth = require('../middleware/authMiddleware'); 

router.get('/equipment', auth, shopController.getEquipmentShop);
router.post('/equipment/reroll', auth, shopController.rerollShop);
router.post('/equipment/buy/:equipmentId', auth, shopController.buyEquipment);
router.post('/equipment/equip/:equipmentId', auth, shopController.equipItem);
router.get('/inventory', auth, shopController.getInventory);

module.exports = router;