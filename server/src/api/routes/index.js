import { Router } from 'express'
import passport from 'passport'
import lusca from 'lusca'
import cookieParser from 'cookie-parser'
import sessions from './sessionRouter.js'
import quests from './questRouter.js'
import commands from './commandRouter.js'
import authRouter from './authRouter.js'
import authRequired from '../../middleware/authRequired.js'
import userRouter from './userRouter.js'
import config from '../../config.js'
import leaderboardController from '../controllers/leaderboardController.js'

const router = Router()
router.use(cookieParser())
if (!config.isProduction) {
  router.get('/', (req, res) => {
    res.send('Hello API!')
  })

  router.get('/ip', (req, res) => {
    res.json({ ip: req.ip, forwarded: req.headers['x-forwarded-for'] })
  })
}

router.use(
  '/commands',
  passport.authenticate('jwt', { session: false }),
  authRequired,
  commands
)
router.use('/auth', authRouter)
router.use('/sessions', authRequired, sessions)
router.use(
  lusca({
    csrf: {
      cookie: { name: '_csrf' },
      header: 'x-csrf-token',
      secret: config.secret,
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  })
)

router.use('/quests', quests)
router.use('/users', userRouter)

router.get('/survey', (req, res) => {
  if (!config.surveyUrl) {
    res.status(404).send('Survey not configured')
    return
  }
  res.redirect(config.surveyUrl)
})

router.get('/bug-report', (req, res) => {
  if (!config.bugReportUrl) {
    res.status(404).send('Bug report not configured')
    return
  }
  res.redirect(config.bugReportUrl)
})

router.get('/leaderboard', leaderboardController)

export default router
