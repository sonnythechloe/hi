import os
from pathlib import Path

import httpx
import serial
from dotenv import load_dotenv
from postgrest.exceptions import APIError
from supabase import create_client

PORT = "/dev/cu.usbmodem1101"
BAUD_RATE = 9600
ENV_FILE = Path(__file__).resolve().parent / ".env"


def report_serial_error(error: serial.SerialException | OSError) -> None:
    message = str(error).lower()
    if "busy" in message or "resource temporarily unavailable" in message:
        print(f"아두이노 포트를 다른 프로그램이 사용 중입니다: {PORT}")
    elif "permission" in message:
        print(f"아두이노 포트 접근 권한이 없습니다: {PORT}")
    elif "no such file" in message or "not found" in message:
        print(f"아두이노 포트를 찾을 수 없습니다: {PORT}")
    else:
        print(f"시리얼 포트 오류 ({type(error).__name__}): {PORT}")


def main() -> int:
    if not ENV_FILE.is_file():
        print(f".env 파일을 찾을 수 없습니다: {ENV_FILE}")
        return 1

    load_dotenv(dotenv_path=ENV_FILE)
    supabase_url = os.getenv("VITE_SUPABASE_URL")
    supabase_key = os.getenv("VITE_SUPABASE_ANON_KEY")
    missing = [
        name
        for name, value in (
            ("VITE_SUPABASE_URL", supabase_url),
            ("VITE_SUPABASE_ANON_KEY", supabase_key),
        )
        if not value
    ]
    if missing:
        print(f".env에 필요한 환경변수가 없습니다: {', '.join(missing)}")
        return 1

    try:
        client = create_client(supabase_url, supabase_key)
    except (TypeError, ValueError, httpx.HTTPError) as error:
        print(f"Supabase 클라이언트 초기화 실패 ({type(error).__name__}).")
        return 1

    try:
        with serial.Serial(PORT, BAUD_RATE, timeout=1) as arduino:
            print(f"아두이노 연결됨: {PORT} ({BAUD_RATE} baud)")
            while True:
                line = arduino.readline()
                if not line:
                    continue

                try:
                    value_text = line.decode("ascii").strip()
                except UnicodeDecodeError:
                    print("현재 값: 판독할 수 없는 데이터 | 업로드 실패: 숫자 형식이 아닙니다.")
                    continue

                if value_text not in ("0", "1"):
                    print(
                        f"현재 값: {value_text!r} | "
                        "업로드 실패: 센서값은 0 또는 1이어야 합니다."
                    )
                    continue

                value = int(value_text)
                try:
                    client.table("readings").insert({"value": value}).execute()
                except (APIError, httpx.HTTPError) as error:
                    print(f"현재 값: {value} | 업로드 실패 ({type(error).__name__}).")
                else:
                    print(f"현재 값: {value} | 업로드 성공")
    except KeyboardInterrupt:
        print("\n프로그램을 정상 종료합니다.")
        return 0
    except (serial.SerialException, OSError) as error:
        report_serial_error(error)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
