// 播放模式枚丽数
import { PlayMode } from '@/enum'
import { Track } from '@/stores/interface'
import { urlV1, lyric } from '@/api'
import { ElNotification } from 'element-plus'
import { LyricData } from '@/utils/parseLyrics'

export function useMusicPlayer() {
  const audioStore = useAudioStore()
  // 默认数据
  const defaultSong = {
    title: '未选择歌曲',
    singer: '未知歌手',
    cover: new URL(`@/assets/default_album.jpg`, import.meta.url).href
  };
  // 计算属性，用来获取当前播放的歌曲
  const currentSong = computed(
    () => audioStore.trackList[audioStore.currentSongIndex as number] || defaultSong
  )
  // 用于追踪播放状态的响应式变量
  const isPlaying = ref(false)
  // 当前播放模式的响应式变量
  const playMode = ref(PlayMode.Sequence)
  // 创建一个新的Audio实例
  const audio = new Audio()
  // 添加当前时间和总时间的响应式引用
  const currentTime = ref(0)
  const duration = ref(0)
  // 音量控制
  const volume = ref(70) // 音量范围：0到100
  // 音乐歌词
  const lyricsData = ref<LyricData>({
    lines: [],
  })
  // 用于追踪当前歌词索引
  const currentLyricIndex = ref(0)

  // 在组件挂载时添加事件监听器
  onMounted(() => {
    audio.src = currentSong.value.source
    audio.ontimeupdate = () => {
      currentTime.value = audio.currentTime
    }

    audio.onloadedmetadata = () => {
      duration.value = audio.duration
    }
    // 初始化音量
    audio.volume = volume.value / 100 // 将音量转换为 0 到 1 的范围

    // 歌曲播放完毕后自动切换
    audio.onended = () => {
      playNext()
    }

    // 添加错误监听
    audio.onerror = async () => {
      await handleAudioError()
    }
  })

  const handleAudioError = async () => {
    if (!audio.error) return

    if (audio.error.code === audio.error.MEDIA_ERR_SRC_NOT_SUPPORTED) {
      currentTime.value = 0
      duration.value = 0
      try {
        // 尝试获取新的音源地址，然后重新播放
        const { data } = await urlV1(currentSong.value.id)
        if (!data[0].url) {
          ElNotification({
            title: '提示',
            message: "获取新源失败。",
            type: 'error',
          })
          pause()
        }
        audio.src = data[0].url
        audioStore.setCurrentSongUrl(data[0].url)
        audio.load()
        play()
      } catch (e) {
        // 如果有获取新源失败的专用错误信息
        // errorMessage = "获取新源失败。";
      }
    }
  }

  // 加载歌词
  async function Loadlyrics() {
    // 初始化歌词当前坐标
    lyricsData.value = { lines: [] }
    try {
      if (
        currentSong.value.Lyric &&
        (currentSong.value.Lyric.lines.length > 0 ||
          currentSong.value.Lyric.remark)
      ) {
        // 如果 `currentSong` 已有歌词
        // 这里可直接更新使用已有的 `lyric` 字段
        // 在模板中用它的 `lyric` 字段显示
        lyricsData.value = currentSong.value.Lyric
      } else {
        const result = await lyric(currentSong.value.id) // 调用 API 获取歌词
        lyricsData.value = parseAndMergeLyrics(result)
        // 缓存歌词
        audioStore.setCurrentSonglyrics(lyricsData.value)
      }
      // 初始化歌词
      findCurrentLyricIndex()
    } catch (error) {
      console.error('获取歌词时出错:', error)
    }
  }

  // 用于查找当前歌词索引
  function findCurrentLyricIndex(newTime = 0) {
    if (lyricsData.value.lines.length === 0) return

    const targetIndex = lyricsData.value.lines.findIndex(
      (line) => line.time > newTime * 1000
    )
    currentLyricIndex.value =
      targetIndex === -1 ? lyricsData.value.lines.length - 1 : targetIndex - 1
  }

  // 函数计算当前高亮歌词的位置，并将其滚动到中间。使用 offsetTop 属性获取元素距离顶部的距离，并设置 scrollTop。
  function scrollToCurrentLyric(el: HTMLDivElement) {
    if (!el) return

    const activeLyric = el.querySelector('.activeLyric') as HTMLElement

    if (activeLyric) {
      el.scrollTop =
        activeLyric.offsetTop - el.clientHeight / 2 - activeLyric.clientHeight
    }
  }

  // 更新currentLyricIndex
  watch(currentTime, (newTime) => {
    findCurrentLyricIndex(newTime) // 每次 currentTime 更新时查找当前歌词索引
  })

  // 播放音乐
  function play() {
    audio.play()
    isPlaying.value = true
  }

  // 暂停音乐
  function pause() {
    audio.pause()
    isPlaying.value = false
  }

  // 切换播放/暂停状态
  function togglePlayPause() {
    if (isPlaying.value) {
      pause()
    } else {
      play()
    }
  }

  // 设置播放模式
  function setPlayMode(mode: PlayMode) {
    playMode.value = mode
    ElNotification({
      title: 'Play mode',
      message: mode + ' mode',
      type: 'success',
    })
  }

  // 播放下一首歌曲
  function playNext() {
    switch (playMode.value) {
      case PlayMode.Random: // 如果是随机模式，则随机选择一首歌曲播放
        playRandomSong()
        break
      case PlayMode.Single: // 单曲循环模式，重新播放当前歌曲
        audio.currentTime = 0 // 回到开头
        play()
        break
      default: // 对于顺序播放和列表循环模式，播放列表中的下一首歌
        let nextIndex = (audioStore.currentSongIndex as number) + 1
        if (nextIndex >= audioStore.trackList.length) {
          nextIndex = 0 // 如果是最后一首歌，则回到列表的开始
        }
        audioStore.setCurrentSong(nextIndex)
        audio.src = currentSong.value.source // 更新audio元素的资源地址
        Loadlyrics()
        play()
        break
    }
  }

  // 播放上一首歌曲
  function playPrevious() {
    let previousIndex = (audioStore.currentSongIndex as number) - 1
    if (previousIndex < 0) {
      previousIndex = audioStore.trackList.length - 1 // 如果是第一首歌，则跳到列表的最后
    }
    audioStore.setCurrentSong(previousIndex)
    audio.src = currentSong.value.source // 更新audio元素的资源地址
    Loadlyrics()
    play()
  }

  // 随机播放一首歌曲
  function playRandomSong() {
    const randomIndex = Math.floor(Math.random() * audioStore.trackList.length)
    audioStore.setCurrentSong(randomIndex) // 设置当前歌曲为随机选择的歌曲
    audio.src = currentSong.value.source // 更新audio元素的资源地址
    play()
  }

  // 改变当前歌曲时间
  const changeCurrentTime = (currentTime: number) => {
    nextTick(() => {
      audio.currentTime = Math.round(currentTime)
    })
  }

  // 设置音量
  const setVolume = (newVolume: number) => {
    volume.value = newVolume
    audio.volume = newVolume / 100 // 将音量转换为 0 到 1 的范围
  }

  // 添加播放歌曲的方法
  const playSong = (song: Track) => {
    audio.src = song.source // 确保您设置此歌曲的音频源
    play() // 播放歌曲
  }

  return {
    currentSong,
    isPlaying,
    play,
    playNext,
    playPrevious,
    togglePlayPause,
    playMode,
    setPlayMode,
    audio,
    currentTime, // 暴露当前播放时间
    duration, // 暴露歌曲总时间
    changeCurrentTime,
    setVolume,
    volume,
    playSong,
    Loadlyrics,
    lyricsData,
    currentLyricIndex,
    scrollToCurrentLyric,
  }
}
