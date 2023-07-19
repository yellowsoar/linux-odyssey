import { model, Schema } from 'mongoose'

const Session = model(
  'Session',
  new Schema(
    {
      name: String,
      containerId: String,
      user: {
        type: Schema.ObjectId,
        ref: 'User',
      },
      quest: {
        type: Schema.ObjectId,
        ref: 'Quest',
      },
      finishedAt: Date,
      terminals: [String],
    },
    { timestamps: true }
  )
)

export default Session
