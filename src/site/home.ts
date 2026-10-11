import './site.css'
import { mountNav } from './layout'
import { storedIdentity } from '../admin/keys'
import { DEFAULT_RELAYS } from '../shared/protocol'
import { open } from '../widget'

mountNav('home')

const hint = document.getElementById('try-hint')!
document.getElementById('try')!.addEventListener('click', () => {
  const id = storedIdentity()
  if (!id) {
    hint.hidden = false
    hint.innerHTML = 'You need an admin key to receive the test report — <a href="./admin.html">create one in the admin inbox</a> first (takes 5 seconds).'
    return
  }
  open({ admin: id.pubkey, relays: DEFAULT_RELAYS, project: { id: 'feedbacklet-demo', name: 'Feedbacklet demo' } })
  hint.hidden = false
  hint.innerHTML = 'Reports from this demo arrive in your <a href="./admin.html">admin inbox</a> under the “Feedbacklet demo” project.'
})
