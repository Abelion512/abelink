import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * LiveAudio legacy redirect.
 * Ponytail Ultra YAGNI: seluruh fungsi live audio telah diintegrasikan langsung
 * ke AbelinkHome sebagai mode default (Jarvis Mode).
 */
const LiveAudio = () => {
  const navigate = useNavigate()

  useEffect(() => {
    navigate('/?mode=voice', { replace: true })
  }, [navigate])

  return null
}

export default LiveAudio
