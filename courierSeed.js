const mongoose = require('mongoose');
const dotenv = require('dotenv');
const CourierRate = require('./models/CourierRate');
const ZoneMapping = require('./models/ZoneMapping');

dotenv.config();

const zonesData = [
  { pincodeStart: '600000', pincodeEnd: '649999', zone: 'Zone A', stateName: 'Tamil Nadu' },
  { pincodeStart: '670000', pincodeEnd: '699999', zone: 'Zone B', stateName: 'Kerala' },
  { pincodeStart: '560000', pincodeEnd: '599999', zone: 'Zone B', stateName: 'Karnataka' },
  { pincodeStart: '500000', pincodeEnd: '539999', zone: 'Zone B', stateName: 'Andhra Pradesh & Telangana' },
  { pincodeStart: '400000', pincodeEnd: '449999', zone: 'Zone C', stateName: 'Maharashtra' },
  { pincodeStart: '360000', pincodeEnd: '399999', zone: 'Zone C', stateName: 'Gujarat' },
  { pincodeStart: '110000', pincodeEnd: '119999', zone: 'Zone D', stateName: 'Delhi' },
  { pincodeStart: '200000', pincodeEnd: '289999', zone: 'Zone D', stateName: 'Uttar Pradesh' },
  { pincodeStart: '300000', pincodeEnd: '349999', zone: 'Zone D', stateName: 'Rajasthan' },
  { pincodeStart: '120000', pincodeEnd: '199999', zone: 'Zone D', stateName: 'North States (Punjab/Haryana/JK)' },
  { pincodeStart: '700000', pincodeEnd: '749999', zone: 'Zone E', stateName: 'West Bengal' },
  { pincodeStart: '750000', pincodeEnd: '779999', zone: 'Zone E', stateName: 'Odisha' },
  { pincodeStart: '800000', pincodeEnd: '899999', zone: 'Zone E', stateName: 'Bihar & Jharkhand' },
  { pincodeStart: '780000', pincodeEnd: '799999', zone: 'Zone E', stateName: 'Northeast States' },
];

const couriers = [
  { name: 'Professional Courier', fuel: 10 },
  { name: 'ST Courier', fuel: 12 },
  { name: 'DTDC', fuel: 15 }
];

const serviceTypes = ['Surface', 'Express', 'Air'];
const shipmentTypes = ['Document', 'Non-Document'];
const zones = ['Zone A', 'Zone B', 'Zone C', 'Zone D', 'Zone E'];
const zoneIndex = { 'Zone A': 0, 'Zone B': 1, 'Zone C': 2, 'Zone D': 3, 'Zone E': 4 };

const seedCourierData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tenaquarium');
    console.log('MongoDB Connected for Courier Seeding...');

    // Clear existing data
    await CourierRate.deleteMany({});
    await ZoneMapping.deleteMany({});
    console.log('Cleared existing CourierRate and ZoneMapping entries.');

    // Seed Zone Mappings
    await ZoneMapping.insertMany(zonesData);
    console.log(`Seeded ${zonesData.length} zone mappings.`);

    // Seed Courier Rates programmatically
    const rateCards = [];

    for (const courier of couriers) {
      for (const service of serviceTypes) {
        for (const type of shipmentTypes) {
          for (const fromZ of zones) {
            for (const toZ of zones) {
              const diff = Math.abs(zoneIndex[fromZ] - zoneIndex[toZ]);
              const distanceMultiplier = 1 + diff * 0.45;

              // Base Pricing Matrix
              let baseCost = 0;
              let extraCost = 0;

              if (courier.name === 'Professional Courier') {
                if (service === 'Surface') { baseCost = 35; extraCost = 10; }
                else if (service === 'Express') { baseCost = 55; extraCost = 15; }
                else { baseCost = 90; extraCost = 28; }
              } else if (courier.name === 'ST Courier') {
                if (service === 'Surface') { baseCost = 45; extraCost = 12; }
                else if (service === 'Express') { baseCost = 70; extraCost = 18; }
                else { baseCost = 110; extraCost = 32; }
              } else { // DTDC
                if (service === 'Surface') { baseCost = 55; extraCost = 15; }
                else if (service === 'Express') { baseCost = 85; extraCost = 22; }
                else { baseCost = 140; extraCost = 42; }
              }

              // Adjust for Document vs Non-Document
              let baseWeight = 1.0;
              if (type === 'Document') {
                baseWeight = 0.5;
                baseCost = baseCost * 0.8; // documents are cheaper
                extraCost = extraCost * 0.75;
              }

              // Final programmatic prices
              const finalBasePrice = Math.round(baseCost * distanceMultiplier);
              const finalAdditionalKgPrice = Math.round(extraCost * distanceMultiplier);

              // Delivery days estimation
              let estDays = 2;
              if (service === 'Surface') estDays = 3 + diff * 1.5;
              else if (service === 'Express') estDays = 2 + diff * 1;
              else estDays = 1 + diff * 0.5;

              rateCards.push({
                courierName: courier.name,
                fromZone: fromZ,
                toZone: toZ,
                shipmentType: type,
                serviceType: service,
                baseWeight,
                basePrice: finalBasePrice,
                additionalKgPrice: finalAdditionalKgPrice,
                fuelChargePercent: courier.fuel,
                gstPercent: 18,
                activeStatus: true,
                estDays: Math.ceil(estDays)
              });
            }
          }
        }
      }
    }

    await CourierRate.insertMany(rateCards);
    console.log(`Seeded ${rateCards.length} courier rate cards.`);

    console.log('Courier Calculator Seeding Completed Successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding Error:', error);
    process.exit(1);
  }
};

seedCourierData();
