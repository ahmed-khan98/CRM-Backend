import multer from "multer";

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "./public/temp")
    },
    filename: function (req, file, cb) {
      const unique=Date.now()+'-'+Math.round(Math.random() * Date.now())
      cb(null,unique+file?.originalname)
    }
  })    
  
export const upload = multer({ 
    storage, 
     limits: {  
        fileSize: 1000 * 1024 * 1024,
    },
})