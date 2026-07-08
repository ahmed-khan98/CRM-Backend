import mongoose, { Schema } from "mongoose";

const clientSchema = new Schema(
  {
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      // required: true,
    },
    handleBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    name: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
      required: true,
    },
    companyName: {
      type: String,
      trim: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    serialNo: { type: String, trim: true },

    address: {
      street: String,
      city: String,
      country: String,
    },

    phoneNo: { type: String, required: true },
    signupType: {
      type: String,
      enum: [
        "cold",
        "PPC",
        "chat",
        "email",
        "google",
        "facebook",
        "USPTO",
        "meta",
        "instagram",
        "linkedin",
        "twitter",
        "other",
      ],
      default: "other",
    },
    image: {
      type: String,
      //   required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Client delete hone par uska project aur us project ke tasks auto-delete
clientSchema.pre("findOneAndDelete", async function (next) {
  const clientId = this.getQuery()["_id"];
  await mongoose.model("Project").findOneAndDelete({ clientId });
  next();
});

export const Client = mongoose.model("Client", clientSchema);
