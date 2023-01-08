import { ValidateProps } from '../../../../src/api-lib/constants'
import {
    createToken,
    findAndDeleteTokenByIdAndType,
    findUserByEmail,
    UNSAFE_updateUserPassword,
} from '../../../../src/api-lib/db'
import { CONFIG as MAIL_CONFIG, sendMail } from '../../../../src/api-lib/mail'
import { validateBody } from '../../../../src/api-lib/middlewares'
import { getMongoDb } from '../../../../src/api-lib/mongodb'
import { ncOpts } from '../../../../src/api-lib/nc'
import nc from 'next-connect'
import normalizeEmail from 'validator/lib/normalizeEmail'
import { EmailTemplates } from '../../../../src/pages/Auth/emailTemplates'

const handler = nc(ncOpts)

handler.post(
    validateBody({
        type: 'object',
        properties: {
            email: ValidateProps.user.email,
        },
        required: ['email'],
        additionalProperties: false,
    }),
    async (req, res) => {
        const db = await getMongoDb()

        const email = normalizeEmail(req.body.email)
        const user = await findUserByEmail(db, email)
        if (!user) {
            res.status(400).json({
                error: { message: 'We couldn’t find that email. Please try again.' },
            })
            return
        }

        const token = await createToken(db, {
            creatorId: user._id,
            type: 'passwordReset',
            expireAt: new Date(Date.now() + 1000 * 60 * 20),
        })
        const data = EmailTemplates(token, null)

        await sendMail({
            to: email,
            from: MAIL_CONFIG.from,
            subject: '[nextjs-mongodb-app] Reset your password.',
            html: data,
        })

        res.status(204).end()
    },
)

handler.put(
    validateBody({
        type: 'object',
        properties: {
            password: ValidateProps.user.password,
            token: { type: 'string', minLength: 0 },
        },
        required: ['password', 'token'],
        additionalProperties: false,
    }),
    async (req, res) => {
        const db = await getMongoDb()

        const deletedToken = await findAndDeleteTokenByIdAndType(
            db,
            req.body.token,
            'passwordReset',
        )
        if (!deletedToken) {
            res.status(403).end()
            return
        }
        await UNSAFE_updateUserPassword(db, deletedToken.creatorId, req.body.password)
        res.status(204).end()
    },
)

export default handler
