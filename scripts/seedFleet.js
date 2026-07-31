import mongoose from "mongoose";
import dotenv from "dotenv";
import { Vendor } from "../src/models/vendor.model.js";
import { Vehicle } from "../src/models/vehicle.model.js";
import { Employee } from "../src/models/employee.model.js";

dotenv.config();

async function seedFleet() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const admin =
    (await Employee.findOne({ role: "ADMIN" }).select("_id")) ||
    (await Employee.findOne({ role: "SUBADMIN" }).select("_id"));

  const createdBy = admin?._id || null;

  // Upsert vendors by email so re-running is safe
  const vendorsData = [
    {
      companyName: "Star Fleet Services",
      vendorName: "Usman Tariq",
      email: "usman@starfleet.pk",
      phone: "+92 300 1112233",
      emergencyPhone: "+92 300 1112244",
      address: "12 Main Boulevard, Gulberg",
      city: "Lahore",
      state: "Punjab",
      country: "Pakistan",
      postalCode: "54000",
      taxNumber: "TAX-SFS-2019",
      registrationNumber: "REG-SFS-0012",
      status: "active",
      notes: "Specializes in passenger transport and corporate fleet management.",
      createdBy,
    },
    {
      companyName: "Al-Noor Logistics",
      vendorName: "Ahmed Khan",
      email: "ahmed@alnoorlogistics.pk",
      phone: "+92 321 5556677",
      emergencyPhone: "+92 321 5556688",
      address: "45 Shahrah-e-Faisal",
      city: "Karachi",
      state: "Sindh",
      country: "Pakistan",
      postalCode: "75350",
      taxNumber: "TAX-ANL-2021",
      registrationNumber: "REG-ANL-0045",
      status: "active",
      notes: "Primary cargo delivery partner for Karachi routes.",
      createdBy,
    },
  ];

  const vendors = [];
  for (const v of vendorsData) {
    const doc = await Vendor.findOneAndUpdate(
      { email: v.email },
      { $set: v },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    vendors.push(doc);
    console.log(`Vendor ready: ${doc.companyName} (${doc._id})`);
  }

  const vehiclesData = [
    {
      vendor: vendors[0]._id,
      vehicleName: "Toyota Corolla 2023",
      make: "Toyota",
      model: "Corolla",
      year: 2023,
      rentAmount: 8500,
      registrationNumber: "LHR-SFS-3301",
      chassisNumber: "JTDBR32E900123001",
      engineNumber: "ENG-COR-23001",
      color: "White",
      fuelType: "petrol",
      transmission: "automatic",
      seatingCapacity: 5,
      mileage: 18500,
      status: "available",
      notes: "Corporate staff shuttle vehicle.",
      createdBy,
      mileageHistory: [
        {
          date: new Date(),
          mileage: 18500,
          notes: "Initial mileage",
          createdBy,
        },
      ],
    },
    {
      vendor: vendors[0]._id,
      vehicleName: "Honda BRV 2021",
      make: "Honda",
      model: "BRV",
      year: 2021,
      rentAmount: 9500,
      registrationNumber: "LHR-SFS-4412",
      chassisNumber: "MHRDG1850M1234002",
      engineNumber: "ENG-BRV-21002",
      color: "Silver",
      fuelType: "petrol",
      transmission: "manual",
      seatingCapacity: 7,
      mileage: 42000,
      status: "inactive",
      notes: "Family / group transport.",
      createdBy,
      mileageHistory: [
        {
          date: new Date(),
          mileage: 42000,
          notes: "Initial mileage",
          createdBy,
        },
      ],
    },
    {
      vendor: vendors[1]._id,
      vehicleName: "Toyota Hilux 2022",
      make: "Toyota",
      model: "Hilux",
      year: 2022,
      rentAmount: 15000,
      registrationNumber: "KHI-ALN-1122",
      chassisNumber: "JTFHX02P900123456",
      engineNumber: "ENG-HLX-22001",
      color: "White",
      fuelType: "diesel",
      transmission: "manual",
      seatingCapacity: 5,
      mileage: 38000,
      status: "available",
      notes: "Primary cargo delivery vehicle for Karachi routes.",
      createdBy,
      mileageHistory: [
        {
          date: new Date(),
          mileage: 38000,
          notes: "Initial mileage",
          createdBy,
        },
      ],
    },
    {
      vendor: vendors[1]._id,
      vehicleName: "Suzuki Bolan 2020",
      make: "Suzuki",
      model: "Bolan",
      year: 2020,
      rentAmount: 4500,
      registrationNumber: "KHI-ALN-7788",
      chassisNumber: "MHYAA51S000778801",
      engineNumber: "ENG-BOL-20088",
      color: "White",
      fuelType: "petrol",
      transmission: "manual",
      seatingCapacity: 8,
      mileage: 61000,
      status: "maintenance",
      notes: "City logistics van.",
      createdBy,
      maintenanceHistory: [
        {
          date: new Date(),
          mileage: 61000,
          notes: "Engine service scheduled",
          createdBy,
        },
      ],
      mileageHistory: [
        {
          date: new Date(),
          mileage: 61000,
          notes: "Initial mileage",
          createdBy,
        },
      ],
    },
  ];

  for (const veh of vehiclesData) {
    const doc = await Vehicle.findOneAndUpdate(
      { registrationNumber: veh.registrationNumber },
      { $set: veh },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`Vehicle ready: ${doc.vehicleName} (${doc.registrationNumber})`);
  }

  console.log("Fleet seed complete.");
  await mongoose.disconnect();
}

seedFleet().catch((err) => {
  console.error(err);
  process.exit(1);
});
