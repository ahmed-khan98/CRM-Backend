import { user } from '../helper/db';

export const a = async (req, res, next) => {
    const users = await user.findMany();
    return res.status(200).json({
        users: users
    });
}
export const b = (req, res, next) => {
    return res.status(200).json("aabbcc");
}