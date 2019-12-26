import TelegramBotClient from 'node-telegram-bot-api'
import StateMachine from 'javascript-state-machine'

function createFsm() {
  return StateMachine.create({
    initial: 'waitingstart',
    final: 'final',
    events: [
      { name: 'gotstart', from: 'waitingstart', to: 'waitingname' },
      { name: 'gotname', from: 'waitingname', to: 'echoing' },
      { name: 'gottext', from: 'echoing', to: 'echoing' },
      { name: 'gotstop', from: 'echoing', to: 'confirm' },
      { name: 'confirmed', from: 'confirm', to: 'final' },
      { name: 'cancelled', from: 'confirm', to: 'echoing' },
      { name: 'invalid', from: 'confirm', to: 'confirm' }
    ]
  })
}

function eventFromStateAndMessageText(state, text) {
  switch (state) {
  case 'waitingstart':
    return text === '/start' && 'gotstart'
    break
  case 'waitingname':
    return 'gotname'
    break
  case 'echoing':
    return text === '/stop' ? 'gotstop' : 'gottext'
    break
  case 'confirm':
    if (text === 'yes') {
      return 'confirmed'
    } else if (text === 'no') {
      return 'cancelled'
    } else {
      return 'invalid'
    }
  }
}

export default class Bot {
  constructor(token) {
    this.client = new TelegramBotClient(token, { polling: true })
  }

  start() {
    this.client.on('message', message => {
      if (!message.reply_to_message) {
        this.respondTo(message)
      }
    })
  }

  async respondTo(message) {
    let fsm = createFsm()
    let lastReply = message

    let name
    let lastMessage

    fsm.ongotstart = () => {
      lastMessage = this.client.sendMessage(message.chat.id,
                                            'Let\'s begin! What\'s your name?',
                                            { reply_markup: JSON.stringify({ force_reply: true }) })
    }

    fsm.ongotname = (event, from, to, message) => {
      name = message.text
      lastMessage = this.client.sendMessage(message.chat.id,
                                            `Got it ${name}, I'll begin echoing your replies until you respond with /stop`,
                                            { reply_markup: JSON.stringify({ force_reply: true }) })
    }

    fsm.ongottext = (event, from, to, message) => {
      lastMessage = this.client.sendMessage(message.chat.id,
                                            `Echoing for ${name}: ${message.text}`,
                                            { reply_markup: JSON.stringify({ force_reply: true }) })
    }

    fsm.ongotstop = () => {
      lastMessage = this.client.sendMessage(message.chat.id,
                                            'Are you sure you want to stop? (yes/no)',
                                            { reply_markup: JSON.stringify({ force_reply: true }) })
    }

    fsm.onconfirmed = () => {
      lastMessage = this.client.sendMessage(message.chat.id,
                                            'We\'re done here, see ya!')
    }

    fsm.oncancelled = () => {
      lastMessage = this.client.sendMessage(message.chat.id,
                                            'Alright, going back to echoing',
                                            { reply_markup: JSON.stringify({ force_reply: true }) })
    }

    fsm.oninvalid = () => {
      lastMessage = this.client.sendMessage(message.chat.id,
                                            'Sorry, I didn\'t catch that, do you want to cancel? (yes/no)',
                                            { reply_markup: JSON.stringify({ force_reply: true }) })
    }

    while (!fsm.isFinished()) {
      let text = lastReply.text
      let event = eventFromStateAndMessageText(fsm.current, text)

      if (!event || fsm.cannot(event)) {
        this.client.sendMessage(message.chat.id, 'I wasn\'t expecting that, try /start')
        break
      }

      fsm[event](lastReply)

      let sentMessage = await lastMessage
      lastReply = await new Promise(resolve => this.client.onReplyToMessage(sentMessage.chat.id, sentMessage.message_id, resolve))
    }
  }
}
