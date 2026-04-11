import subprocess
import sys
import os

def run_tests():
    print("Test Runner: Running automated tests (pytest)...")
    
    # Kiểm tra xem có thư mục tests không
    if not os.path.exists("tests"):
        print("[SKIP] No 'tests' directory found.")
        return True

    try:
        # Chạy pytest
        result = subprocess.run([sys.executable, "-m", "pytest"], capture_output=True, text=True)
        
        if result.returncode == 0:
            print("[OK] All tests passed!")
            return True
        else:
            print("[FAIL] Some tests failed:")
            print(result.stdout)
            print(result.stderr)
            return False
            
    except FileNotFoundError:
        print("[WARN] pytest not found. Install with 'pip install pytest'.")
        return True 

if __name__ == "__main__":
    if not run_tests():
        sys.exit(1)
    sys.exit(0)

