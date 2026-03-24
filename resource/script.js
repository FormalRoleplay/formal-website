let storeItems = [];
let cart = [];
let filteredItems = [];
let currentCategory = 'all';
let draggedItem = null;

window.addEventListener('message', function(event) {
    const data = event.data;
    
    if (data.action === 'open') {
        storeItems = data.items || [];
        cart = [];
        currentCategory = 'all';
        filteredItems = [...storeItems];
        document.getElementById('storeContainer').style.display = 'block';
        loadLogo(data.logo);
        renderItems();
        updateCart();
        updateTotal();
        setupDragAndDrop();
    } else if (data.action === 'close') {
        const quantityModal = document.getElementById('quantityModal');
        if (quantityModal && quantityModal.style.display !== 'none') {
            closeQuantityModal();
        }
        document.getElementById('storeContainer').style.display = 'none';
    } else if (data.action === 'paymentSuccess') {
        cart = [];
        updateCart();
        updateTotal();
        updateWeight();
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        e.preventDefault();
        closeUI();
    }
});

function closeUI() {
    const quantityModal = document.getElementById('quantityModal');
    if (quantityModal && quantityModal.style.display !== 'none') {
        closeQuantityModal();
    }
    
    document.getElementById('storeContainer').style.display = 'none';
    
    const resourceName = GetParentResourceName();
    
    fetch(`https://${resourceName}/closeUI`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
    }).then(function(response) {
        if (response.ok) {
            return response.text().then(function(text) {
                if (text) {
                    try {
                        return JSON.parse(text);
                    } catch (e) {
                        return text;
                    }
                }
                return null;
            });
        }
        return null;
    }).catch(function(error) {
    });
}

function GetParentResourceName() {
    const hostname = window.location.hostname;
    if (hostname.startsWith('cfx-nui-')) {
        return hostname.substring(8); 
    }
    return hostname;
}

function loadLogo(logoPath) {
    const logoContainer = document.getElementById('logoContainer');
    const logoImage = document.getElementById('logoImage');
    
    if (!logoPath) {
        logoContainer.style.display = 'none';
        return;
    }
    
    if (logoPath === 'logo.png' || logoPath.endsWith('/logo.png')) {
        const resourceName = GetParentResourceName();
        logoImage.src = `nui://${resourceName}/html/images/logo.png`;
    } else if (logoPath.startsWith('http://') || logoPath.startsWith('https://')) {
        logoImage.src = logoPath;
    } else {
        const resourceName = GetParentResourceName();
        logoImage.src = `nui://${resourceName}/html/images/${logoPath}`;
    }
    
    logoImage.onerror = function() {
        logoContainer.style.display = 'none';
    };
    
    logoImage.onload = function() {
        logoContainer.style.display = 'flex';
    };
    
    logoContainer.style.display = 'flex';
}

document.getElementById('searchInput').addEventListener('input', function(e) {
    filterItems();
});

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentCategory = this.dataset.category;
        filterItems();
    });
});

function filterItems() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    
    filteredItems = storeItems.filter(item => {
        const matchesCategory = currentCategory === 'all' || item.category === currentCategory;
        const matchesSearch = !searchTerm || item.name.toLowerCase().includes(searchTerm) || 
                              (item.label && item.label.toLowerCase().includes(searchTerm));
        return matchesCategory && matchesSearch;
    });
    
    renderItems();
}

function renderItems() {
    const grid = document.getElementById('itemsGrid');
    grid.innerHTML = '';
    
    filteredItems.forEach((item, index) => {
        const slot = document.createElement('div');
        slot.className = 'item-slot';
        slot.draggable = true;
        slot.dataset.itemIndex = index;
        
        let imageHtml = '';
        if (item.image) {
            imageHtml = `<img src="${item.image}" alt="${item.label || item.name}" class="item-image-img">`;
        } else {
            const iconClass = item.icon || 'fa-box';
            imageHtml = `<i class="fas ${iconClass}"></i>`;
        }
        
        slot.innerHTML = `
            <div class="item-price">$${item.price || 0}</div>
            <div class="item-image">${imageHtml}</div>
            <div class="item-name">${item.label || item.name || 'Item'}</div>
        `;
        
        slot.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            
            e.preventDefault();
            isDragging = true;
            currentDragItem = filteredItems[index];
            
            const rect = slot.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            
            dragElement = slot.cloneNode(true);
            dragElement.classList.add('custom-drag-element');
            dragElement.style.position = 'fixed';
            dragElement.style.pointerEvents = 'none';
            dragElement.style.zIndex = '10000';
            dragElement.style.width = rect.width + 'px';
            dragElement.style.height = rect.height + 'px';
            dragElement.style.left = (e.clientX - dragOffset.x) + 'px';
            dragElement.style.top = (e.clientY - dragOffset.y) + 'px';
            dragElement.style.opacity = '0.8';
            dragElement.style.transform = 'scale(1.1)';
            
            document.body.appendChild(dragElement);
            slot.style.opacity = '0.5';
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
        
        slot.addEventListener('click', function(e) {
            if (e.shiftKey && !isDragging) {
                e.preventDefault();
                showQuantityPrompt(filteredItems[index]);
            }
        });
        
        slot.addEventListener('contextmenu', function(e) {
            if (e.shiftKey && !isDragging) {
                e.preventDefault();
                removeFromCart(filteredItems[index]);
            }
        });
        
        grid.appendChild(slot);
    });
}

let dragHandlers = null;
let dragOverCounter = 0;
let dropzone = null;
let cartItemsContainer = null;
let storeBottom = null;
let isDragging = false;
let dragElement = null;
let currentDragItem = null;
let dragOffset = { x: 0, y: 0 };
let lastMoveTime = 0;
let isOverCart = false;

function handleMouseMove(e) {
    if (!isDragging || !dragElement) return;
    
    const now = Date.now();
    if (now - lastMoveTime < 16) return;
    lastMoveTime = now;
    
    dragElement.style.left = (e.clientX - dragOffset.x) + 'px';
    dragElement.style.top = (e.clientY - dragOffset.y) + 'px';
    
    const rect = dropzone ? dropzone.getBoundingClientRect() : null;
    const cartRect = cartItemsContainer ? cartItemsContainer.getBoundingClientRect() : null;
    const bottomRect = storeBottom ? storeBottom.getBoundingClientRect() : null;
    
    let isOverDropZone = false;
    
    if (dropzone && rect) {
        const computedStyle = window.getComputedStyle(dropzone);
        if (computedStyle.display !== 'none') {
            if (e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top && e.clientY <= rect.bottom) {
                isOverDropZone = true;
            }
        }
    }
    
    if (!isOverDropZone && cartRect) {
        if (e.clientX >= cartRect.left && e.clientX <= cartRect.right &&
            e.clientY >= cartRect.top && e.clientY <= cartRect.bottom) {
            isOverDropZone = true;
        }
    }
    
    if (!isOverDropZone && bottomRect) {
        if (e.clientX >= bottomRect.left && e.clientX <= bottomRect.right &&
            e.clientY >= bottomRect.top && e.clientY <= bottomRect.bottom) {
            isOverDropZone = true;
        }
    }
    
    if (isOverDropZone !== isOverCart) {
        isOverCart = isOverDropZone;
        
        if (dropzone) {
            if (isOverCart) {
                dropzone.classList.add('drag-over');
            } else {
                dropzone.classList.remove('drag-over');
            }
        }
    }
}

function handleMouseUp(e) {
    if (!isDragging) return;
    
    if (isOverCart && currentDragItem) {
        addToCart(currentDragItem);
    }
    
    cleanupDrag();
}

function cleanupDrag() {
    if (dragElement) {
        dragElement.remove();
        dragElement = null;
    }
    
    const allSlots = document.querySelectorAll('.item-slot');
    allSlots.forEach(slot => {
        slot.style.opacity = '';
    });
    
    if (dropzone) {
        dropzone.classList.remove('drag-over');
    }
    
    isDragging = false;
    isOverCart = false;
    currentDragItem = null;
    lastMoveTime = 0;
    
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
}

function setupDragAndDrop() {
    dropzone = document.getElementById('cartDropzone');
    cartItemsContainer = document.getElementById('cartItems');
    storeBottom = document.querySelector('.store-bottom');
}

document.addEventListener('DOMContentLoaded', function() {
    setupDragAndDrop();
    setupQuantityModal();
    setupCloseButton();
});

function setupCloseButton() {
    const closeBtn = document.getElementById('closeBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            closeUI();
        });
    }
}

function addToCart(item, quantity) {
    quantity = quantity || 1;
    
    const existingItem = cart.find(c => c.name === item.name);
    
    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cart.push({
            name: item.name,
            label: item.label || item.name,
            price: item.price || 0,
            quantity: quantity,
            image: item.image,
            icon: item.icon || 'fa-box',
            weight: item.weight || 0
        });
    }
    
    updateCart();
    updateTotal();
    updateWeight();
}

let currentQuantityItem = null;

function showQuantityPrompt(item) {
    currentQuantityItem = item;
    const modal = document.getElementById('quantityModal');
    const title = document.getElementById('quantityModalTitle');
    const itemDisplay = document.getElementById('quantityModalItem');
    const priceDisplay = document.getElementById('quantityModalPrice');
    const input = document.getElementById('quantityInput');
    
    title.textContent = `Add ${item.label || item.name} to Cart`;
    
    let imageHtml = '';
    if (item.image) {
        imageHtml = `<img src="${item.image}" alt="${item.label || item.name}">`;
    } else {
        const iconClass = item.icon || 'fa-box';
        imageHtml = `<i class="fas ${iconClass}"></i>`;
    }
    
    itemDisplay.innerHTML = `
        <div class="quantity-modal-item-image">${imageHtml}</div>
        <div class="quantity-modal-item-info">
            <div class="quantity-modal-item-name">${item.label || item.name}</div>
        </div>
    `;
    
    priceDisplay.textContent = `$${item.price || 0} each`;
    
    input.value = '1';
    updateQuantityTotal();
    
    modal.style.display = 'flex';
    
    setTimeout(() => {
        input.focus();
        input.select();
    }, 100);
}

function updateQuantityTotal() {
    if (!currentQuantityItem) return;
    
    const input = document.getElementById('quantityInput');
    const totalDisplay = document.getElementById('quantityTotal');
    const quantity = parseInt(input.value) || 0;
    const total = (currentQuantityItem.price || 0) * quantity;
    
    totalDisplay.textContent = `Total: $${total.toFixed(2)}`;
}

function confirmQuantity() {
    if (!currentQuantityItem) return;
    
    const input = document.getElementById('quantityInput');
    const quantity = parseInt(input.value);
    
    if (isNaN(quantity) || quantity <= 0) {
        alert('Please enter a valid quantity (greater than 0)');
        input.focus();
        input.select();
        return;
    }
    
    if (quantity > 999) {
        alert('Maximum quantity is 999');
        input.focus();
        input.select();
        return;
    }
    
    addToCart(currentQuantityItem, quantity);
    closeQuantityModal();
}

function closeQuantityModal() {
    const modal = document.getElementById('quantityModal');
    const input = document.getElementById('quantityInput');
    
    modal.style.display = 'none';
    currentQuantityItem = null;
    input.value = '1';
}

function setupQuantityModal() {
    const input = document.getElementById('quantityInput');
    const modal = document.getElementById('quantityModal');
    
    input.addEventListener('input', updateQuantityTotal);
    
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmQuantity();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeQuantityModal();
        }
    });
    
    document.getElementById('quantityModalClose').addEventListener('click', closeQuantityModal);
    document.getElementById('quantityCancelBtn').addEventListener('click', closeQuantityModal);
    document.getElementById('quantityConfirmBtn').addEventListener('click', confirmQuantity);
    
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            closeQuantityModal();
        }
    });
}

function removeFromCart(item) {
    cart = cart.filter(c => c.name !== item.name);
    
    updateCart();
    updateTotal();
    updateWeight();
}

function updateCart() {
    if (!cartItemsContainer || !dropzone) {
        cartItemsContainer = document.getElementById('cartItems');
        dropzone = document.getElementById('cartDropzone');
    }
    
    if (!cartItemsContainer || !dropzone) return;
    
    cartItemsContainer.innerHTML = '';
    
    if (cart.length === 0) {
        dropzone.style.display = 'flex';
        dropzone.classList.remove('has-items');
        cartItemsContainer.style.display = 'none';
        return;
    }
    
    dropzone.style.display = 'flex';
    dropzone.classList.add('has-items');
    cartItemsContainer.style.display = 'flex';
    
    cart.forEach(item => {
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        
        let imageHtml = '';
        if (item.image) {
            imageHtml = `<img src="${item.image}" alt="${item.label || item.name}" class="cart-item-image-img">`;
        } else {
            const iconClass = item.icon || 'fa-box';
            imageHtml = `<i class="fas ${iconClass}"></i>`;
        }
        
        cartItem.innerHTML = `
            <button class="cart-item-remove" data-item-name="${item.name}">
                <i class="fas fa-times"></i>
            </button>
            <div class="cart-item-image">${imageHtml}</div>
            <span class="cart-item-name">${item.label || item.name}</span>
            <span class="cart-item-quantity">x${item.quantity}</span>
            <span class="cart-item-price">$${(item.price * item.quantity).toFixed(2)}</span>
        `;
        
        const removeBtn = cartItem.querySelector('.cart-item-remove');
        removeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            removeFromCart(item);
        });
        
        cartItemsContainer.appendChild(cartItem);
    });
}

function updateTotal() {
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    document.getElementById('totalValue').textContent = `$${total.toFixed(2)}`;
}

async function updateWeight() {
    const cartData = cart.map(item => ({
        name: item.name,
        weight: item.weight || 0,
        quantity: item.quantity
    }));
    
    try {
        const response = await fetch(`https://${GetParentResourceName()}/getCartWeight`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ items: cartData })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.weight !== undefined && data.maxWeight !== undefined) {
                document.getElementById('weightDisplay').textContent = `${data.weight.toFixed(2)} KG / ${data.maxWeight.toFixed(2)} KG`;
            }
        } else {
            const totalWeight = cart.reduce((sum, item) => sum + ((item.weight || 0) * item.quantity), 0);
            document.getElementById('weightDisplay').textContent = `${totalWeight.toFixed(2)} KG / ∞ KG`;
        }
    } catch (error) {
        const totalWeight = cart.reduce((sum, item) => sum + ((item.weight || 0) * item.quantity), 0);
        document.getElementById('weightDisplay').textContent = `${totalWeight.toFixed(2)} KG / ∞ KG`;
    }
}

document.getElementById('payCashBtn').addEventListener('click', function() {
    if (cart.length === 0) return;
    
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const cartData = cart.map(item => ({
        name: item.name,
        label: item.label || item.name,
        quantity: item.quantity,
        price: item.price,
        weight: item.weight || 0
    }));
    
    fetch(`https://${GetParentResourceName()}/payCash`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            items: cartData,
            total: total
        })
    }).catch(function(error) {
    });
});

document.getElementById('payBankBtn').addEventListener('click', function() {
    if (cart.length === 0) return;
    
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const cartData = cart.map(item => ({
        name: item.name,
        label: item.label || item.name,
        quantity: item.quantity,
        price: item.price,
        weight: item.weight || 0
    }));
    
    fetch(`https://${GetParentResourceName()}/payBank`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            items: cartData,
            total: total
        })
    }).catch(function(error) {
    });
});

