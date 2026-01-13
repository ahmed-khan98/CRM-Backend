import { Client } from "../models/client.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const createClient = asyncHandler(async (req, res) => {
  const {
    name,
    phoneNo,
    email,
    departmentId,
    handleBy,
    address,
    companyName,
    brandId,
    signupType,
  } = req.body;
  if (
    [name, phoneNo, departmentId, handleBy].some(
      (field) => field === undefined || field === ""
    )
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existClient = await Client.findOne({ email });
  if (existClient) {
    throw new ApiError(409, "Client email already exists");
  }

  const ClientImg = req.file;

  if (!ClientImg) {
    throw new ApiError(400, "Client Image is required");
  }

  const image = await uploadOnCloudinary(ClientImg, "PPI-Client");

  if (!image.url) {
    throw new ApiError(400, "Client image is not uploaded");
  }
  
  const client = await Client.create({
    name,
    phoneNo,
    email,
    departmentId,
    handleBy,
    address,
    companyName,
    brandId,
    signupType,
    image: image?.url,
  });

  if (!client) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, client, "Client Created Successfully"));
});

const updateClient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, phoneNo, email, departmentId, handleBy, address, companyName,brandId,signupType } =
    req.body;

  const existClient = await Client.findById(id);

  if (!existClient) {
    throw new ApiError(409, "Client not found");
  }

  let image = "";
  const ClientImg = req.file;
  if (ClientImg) {
    const img = await uploadOnCloudinary(ClientImg, "oaxs-Client");

    if (!img.url) {
      throw new ApiError(400, "Client image is not uploaded");
    }
    image = img?.url;
  }

  const ClientData = {
    name,

    phoneNo,
    email,
    departmentId,
    handleBy,
    address,
    companyName,brandId,signupType,
    ...(image !== "" && { image }),
  };

  const client = await Client.findByIdAndUpdate(
    id,
    {
      $set: ClientData,
    },
    { new: true }
  );

  if (!client) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, client, "Client updated Successfully"));
});

const deleteClient = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existClient = await Client.findById(id);

  if (!existClient) {
    throw new ApiError(409, "Client not found");
  }
  const client = await Client.findByIdAndDelete(id);

  if (!client) {
    throw new ApiError("500", "internel server error");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, Client, "Client deleted Successfully"));
});

const getAllClients = asyncHandler(async (req, res) => {
  const clients = await Client.find()
  .sort({ createdAt: -1 }) 
    .populate("departmentId", "name")
    .populate("handleBy", "fullName")
    .populate("brandId", "name");
  if (!clients) {
    throw new ApiError("404", "Client not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, clients, "All Clients found"));
});

const getClientById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const client = await Client.findById(id);
  if (!client) {
    throw new ApiError(404, "Client not found");
    // return res.status(404).json({ error: 'Client not found' });
  }
  return res.status(200).json(new ApiResponse(200, Client, "Client Found"));
});

const getClientByDepartId = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const client = await Client.find({ departmentId: id });
  if (!client) {
    throw new ApiError(404, "Client not found");
    // return res.status(404).json({ error: 'Client not found' });
  }
  return res.status(200).json(new ApiResponse(200, client, "Client Found"));
});

export {
  createClient,
  getAllClients,
  updateClient,
  deleteClient,
  getClientById,
  getClientByDepartId,
};
