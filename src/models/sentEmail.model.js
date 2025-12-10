import mongoose, { Schema } from "mongoose";

const sentEmail = new Schema(
    {
        leadId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Lead",
        },
        listId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "EmailList",
        },
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        brandId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Brand",
        },
        recipients: {
            type: [String], // This is an array of strings
            required: true,
            default: []
        },
        compaignName: {
            type: String,
            lowecase: true,
            trim: true,
        },
        from: {
            type: String,
            lowercase: true,
            trim: true,
        },
        subject: {
            type: String,
            required: true,
            trim: true,
        },
        body: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            enum: ["SOLO", "BULK"],
            default: "SOLO",
        },
        status: {
            type: String,
            enum: ['sent', 'failed'],
            default: 'sent'
        },
        sentAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true,
    }
);

export const SentEmail = mongoose.model("SentEmail", sentEmail);