document.addEventListener("DOMContentLoaded", function() {
    /*리사이징에 따른 height window 값 맞추기*/
    var headerEl = document.querySelector("#header");
    var mPurchaseEl = document.getElementById("mPurchase");
    var productListEl = document.querySelector(".product_list_wrap")

    function handleResize() {
        var headerHeight = headerEl.offsetHeight;
        var computedStyle = window.getComputedStyle(mPurchaseEl);      
        var paddingTop = parseFloat(computedStyle.paddingTop);
        var paddingBottom = parseFloat(computedStyle.paddingBottom);        
        var marginStyle = window.getComputedStyle(productListEl);
        var marginTop = parseFloat(marginStyle.marginTop);
        var innerWidth = window.innerHeight-(headerHeight+paddingTop+paddingBottom);
        var productListHeight = (productListEl.offsetHeight+marginTop);
        
        if(productListHeight > innerWidth){            
            var confirmHeight = document.querySelector('.productConfirm').offsetHeight;
            var iconWrapHeight = document.querySelector('.iconWrap').offsetHeight;
            var bottom = confirmHeight;
            if(confirmHeight > 0) { bottom = confirmHeight+22;}
            
            mPurchaseEl.style.height = ((productListHeight+bottom+iconWrapHeight)+paddingTop)+"px";
        }else{
            mPurchaseEl.style.height = innerWidth+"px";
        }        
    };    

    window.addEventListener('resize', handleResize);
    handleResize();    
});