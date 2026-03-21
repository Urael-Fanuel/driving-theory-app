# Download Israeli regulatory road signs 201-231 from Wikimedia Commons
$dest = "C:\Users\Yakov\Desktop\driving-theory-app\assets\images\תמרורי הוריה"

$signs = @(
  @{num=201; url="https://upload.wikimedia.org/wikipedia/commons/0/05/Israel_road_sign_201.svg"},
  @{num=202; url="https://upload.wikimedia.org/wikipedia/commons/7/7c/Israel_road_sign_202.svg"},
  @{num=203; url="https://upload.wikimedia.org/wikipedia/commons/7/71/Israel_road_sign_203.svg"},
  @{num=204; url="https://upload.wikimedia.org/wikipedia/commons/1/1f/Israel_road_sign_204.svg"},
  @{num=205; url="https://upload.wikimedia.org/wikipedia/commons/3/30/Israel_road_sign_205.svg"},
  @{num=206; url="https://upload.wikimedia.org/wikipedia/commons/5/5b/Israel_road_sign_206.svg"},
  @{num=207; url="https://upload.wikimedia.org/wikipedia/commons/d/d2/Israel_road_sign_207.svg"},
  @{num=208; url="https://upload.wikimedia.org/wikipedia/commons/9/9c/Israel_road_sign_208.svg"},
  @{num=209; url="https://upload.wikimedia.org/wikipedia/commons/3/38/Israel_road_sign_209.svg"},
  @{num=210; url="https://upload.wikimedia.org/wikipedia/commons/7/7b/Israel_road_sign_210.svg"},
  @{num=211; url="https://upload.wikimedia.org/wikipedia/commons/e/e4/Israel_road_sign_211.svg"},
  @{num=212; url="https://upload.wikimedia.org/wikipedia/commons/a/a2/Israel_road_sign_212.svg"},
  @{num=213; url="https://upload.wikimedia.org/wikipedia/commons/4/44/Israel_road_sign_213.svg"},
  @{num=214; url="https://upload.wikimedia.org/wikipedia/commons/0/01/Israel_road_sign_214.svg"},
  @{num=215; url="https://upload.wikimedia.org/wikipedia/commons/e/ee/Israel_road_sign_215.svg"},
  @{num=216; url="https://upload.wikimedia.org/wikipedia/commons/f/f5/Israel_road_sign_216.svg"},
  @{num=217; url="https://upload.wikimedia.org/wikipedia/commons/1/1b/Israel_road_sign_217.svg"},
  @{num=218; url="https://upload.wikimedia.org/wikipedia/commons/b/b2/Israel_road_sign_218.svg"},
  @{num=219; url="https://upload.wikimedia.org/wikipedia/commons/3/33/Israel_road_sign_219.svg"},
  @{num=220; url="https://upload.wikimedia.org/wikipedia/commons/f/f5/Israel_road_sign_220.svg"},
  @{num=221; url="https://upload.wikimedia.org/wikipedia/commons/b/bb/Israel_road_sign_221.svg"},
  @{num=222; url="https://upload.wikimedia.org/wikipedia/commons/4/46/Israel_road_sign_222.svg"},
  @{num=223; url="https://upload.wikimedia.org/wikipedia/commons/3/30/Israel_road_sign_223.svg"},
  @{num=224; url="https://upload.wikimedia.org/wikipedia/commons/f/f1/Israel_road_sign_224.svg"},
  @{num=225; url="https://upload.wikimedia.org/wikipedia/commons/1/19/Israel_road_sign_225.svg"},
  @{num=226; url="https://upload.wikimedia.org/wikipedia/commons/2/24/Israel_road_sign_226.svg"},
  @{num=227; url="https://upload.wikimedia.org/wikipedia/commons/3/31/Israel_road_sign_227.svg"},
  @{num=228; url="https://upload.wikimedia.org/wikipedia/commons/3/3d/Israel_road_sign_228.svg"},
  @{num=229; url="https://upload.wikimedia.org/wikipedia/commons/6/61/Israel_road_sign_229.svg"}
)

$ok = @()
$fail = @()

foreach ($sign in $signs) {
  $outFile = Join-Path $dest "$($sign.num).svg"
  try {
    Invoke-WebRequest -Uri $sign.url -OutFile $outFile -UserAgent "Mozilla/5.0" -ErrorAction Stop
    Write-Host "OK: $($sign.num)" -ForegroundColor Green
    $ok += $sign.num
  } catch {
    Write-Host "FAIL: $($sign.num) - $_" -ForegroundColor Red
    $fail += $sign.num
  }
}

Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "Downloaded OK ($($ok.Count)): $($ok -join ', ')" -ForegroundColor Green
Write-Host "Failed ($($fail.Count)): $($fail -join ', ')" -ForegroundColor Red
Write-Host "Not on Wikimedia (2 signs): 230, 231" -ForegroundColor Yellow
