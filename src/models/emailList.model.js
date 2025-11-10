import mongoose, { Schema } from "mongoose";

const emailList = new Schema({
  listName: {
    type: String,
    required: true,
  },
  emails: [
    {
      type: String,
      required: true,
      lowecase: true,
      trim: true,
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const EmailList = mongoose.model("EmailList", emailList);
