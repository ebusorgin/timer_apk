document.addEventListener('DOMContentLoaded', () => {
    // 1. Reveal Elements on Scroll
    const revealElements = document.querySelectorAll('.reveal');

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, {
        threshold: 0.1
    });

    revealElements.forEach(el => revealObserver.observe(el));

    // 2. Header Scroll Effect
    const header = document.querySelector('.header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    // 3. Form Submission Handling (Visual Only)
    const leadForm = document.getElementById('leadForm');
    if (leadForm) {
        leadForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const submitBtn = leadForm.querySelector('button');
            const originalText = submitBtn.innerText;

            // Simulating a request
            submitBtn.innerText = 'Отправка...';
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.7';

            setTimeout(() => {
                submitBtn.innerText = 'Заявка принята! ✓';
                submitBtn.style.background = 'linear-gradient(135deg, #00ff88, #00f2ff)';
                leadForm.reset();

                setTimeout(() => {
                    submitBtn.innerText = originalText;
                    submitBtn.style.background = '';
                    submitBtn.disabled = false;
                    submitBtn.style.opacity = '1';
                }, 3000);
            }, 1500);
        });
    }

    // 4. Parallax effect for glow background
    window.addEventListener('mousemove', (e) => {
        const x = e.clientX / window.innerWidth;
        const y = e.clientY / window.innerHeight;

        const glow = document.querySelector('.glow-bg');
        if (glow) {
            glow.style.transform = `translate(${x * 20}px, ${y * 20}px)`;
        }
    });
});
