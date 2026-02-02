import mongoose, { Schema } from "mongoose";

const tmEmailListSchema = new Schema({
  listName: {
    type: String,
    required: true,
    trim: true,
    unique: true, // List ka naam duplicate na ho
  },
  // Ab 'emails' aik array hai jisme objects honge
  emails: [
    {
      email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
      },
      name: {
        type: String,
        trim: true,
        default: "",
      },
      serialno: {
        type: String,
        trim: true,
        default: "",
      },
      phoneno: {
        type: String,
        trim: true,
        default: "",
      },
      brandmark: {
        type: String,
        trim: true,
        default: "",
      }
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true }); 

export const TmEmailList = mongoose.model("TmEmailList", tmEmailListSchema);