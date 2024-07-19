import mongoose , {Schema} from 'mongoose'

const blogSchema = new Schema({
    title:{
        type:String,
        required:true,
        unique: true,
    },
    description:{
        type:String,
        required:true
    }
},
{
    timestamps: true,
  }
)
export const Blog = mongoose.model('Blog',blogSchema)