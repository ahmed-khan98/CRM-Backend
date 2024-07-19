import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Booking } from '../models/booking.model.js'
import moment from "moment";


const isTwoHoursDuration = (startTime, endTime) => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const duration = (end - start) / (1000 * 60 * 60); // Duration in hours
  console.log(startTime, endTime, duration,'========---->>>duration')
  return +duration === 2;
};

const isSameDate = (slotDate, bookingDate) => {
    const slot = new Date(slotDate);
    return (
      slot?.getFullYear() === bookingDate?.getFullYear() &&
      slot?.getMonth() === bookingDate?.getMonth() &&
      slot?.getDate() === bookingDate?.getDate()
    );
  };

const createBookingSlots = asyncHandler(async (req, res) => {
    const { date, slots } = req.body;
    console.log(date,'date--------->>')
    if (!date || !slots || !Array.isArray(slots) || slots.length === 0) {
        throw new ApiError(400, "Please provide a date and an array of slots")
    }

    for (const slot of slots) {
      const { startTime, endTime } = slot;
      
      if (!startTime || !endTime) {
        throw new ApiError(400, "Each slot must have startTime and endTime")
      }

      if (new Date(startTime) >= new Date(endTime)) {
        throw new ApiError(400, "startTime must be less than endTime")
      }

      if (!isTwoHoursDuration(startTime, endTime)) {
        throw new ApiError(400, "Each slot duration must be exactly 2 hours")
      }
    //   if (!isSameDate(startTime, date) || !isSameDate(endTime, date)) {
    //     throw new ApiError(400, "startTime and endTime must have the same date");
    //   }
    }
    const existingBooking = await Booking.findOne({ date });

    if (existingBooking) {
      for (let newSlot of slots) {
        for (let existingSlot of existingBooking.slots) {
          const newStart = moment(newSlot.startTime);
          const newEnd = moment(newSlot.endTime);
          const existingStart = moment(existingSlot.startTime);
          const existingEnd = moment(existingSlot.endTime);

          if (
            (newStart.isBetween(existingStart, existingEnd, null, "[)") ||
            newEnd.isBetween(existingStart, existingEnd, null, "(]")) ||
            (newStart.isSame(existingStart) && newEnd.isSame(existingEnd))
          ) {
            throw new ApiError(400, "Slot overlap ")
          }
        }
      }
      existingBooking.slots.push(...slots);
      const booking= await existingBooking.save();
      return res.status(200).json(
        new ApiResponse(200,booking, "Slot Created Successfully----->>")
    )

    } else {
        const booking = await Booking.create({
            date,
            slots
        });
    
        if(!booking){
            throw new ApiError('500','internel server error')
        }
       
        return res.status(200).json(
            new ApiResponse(200,booking, "Slot Created Successfully")
        )
    }
})

const getAllSlot = asyncHandler(async(req,res)=>{
    const booking = await Booking.find();
    if(!booking){
        throw new ApiError('404','Slot not found')   
    }
    return res.status(200).json(
        new ApiResponse(200, booking, "All Slot found")
    )
})

const deleteBooking = asyncHandler(async (req,res)=>{
    const {id} = req.params

    const existBooking= await Booking.findById(id)

    if (!existBooking) {
        throw new ApiError(409, "Booking not found")
    }
    const booking= await Booking.findByIdAndDelete(id)
    
    if(!booking){
        throw new ApiError('500','internel server error')
    }

    return res.status(200).json(
        new ApiResponse(200, booking, "Booking deleted Successfully")
    )
})  

export {createBookingSlots,getAllSlot,deleteBooking}
